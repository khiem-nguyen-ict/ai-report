/**
 * Cohere service — send a text prompt and receive the generated HTML as a string.
 *
 * Requires COHERE_API_KEY in the environment (.env).
 */
const path = require("path");
const fs = require("fs");
const axios = require("axios");

// Load .env (project root) if it has not been loaded already
if (!process.env.COHERE_API_KEY) {
  require("dotenv").config({ path: path.join(__dirname, "../../.env") });
}

const COHERE_API_URL = "https://api.cohere.com/v2/chat";
const DEFAULT_MODEL = "command-a-03-2025";
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_TOKENS = 8192;
const REQUEST_TIMEOUT_MS = 300_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 4000;

// Cohere sometimes answers 422 NO_VALID_RESPONSE_GENERATED (or a 5xx / 429)
// when a single generation transiently fails. Those are worth retrying.
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_TYPES = new Set(["NO_VALID_RESPONSE_GENERATED"]);

const HTML_SYSTEM_PROMPT = [
  "You are a senior technical writer who produces polished HTML documents.",
  "Reply with raw HTML only: no markdown, no code fences, no commentary.",
  "Always return a complete, self-contained HTML document (doctype, head, body).",
  "Use inline <style> blocks for CSS; do not reference external assets.",
].join(" ");

function getApiKey() {
  const key = process.env.COHERE_API_KEY || process.env.COHERE_APIKEY;
  if (!key) {
    throw new Error(
      "❌ COHERE_API_KEY is not set. Add it to your .env file (see .env.sample).",
    );
  }
  return key;
}

/** Strip markdown fences / stray prose so only the HTML document remains. */
function extractHtml(text) {
  if (typeof text !== "string") return "";
  let html = text.trim();

  const fence = html.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  if (fence) html = fence[1];

  return html.trim();
}

/** Build a short, human-readable message for a failed Cohere call. */
function describeCohereError(error) {
  const response = error?.response;
  if (!response) {
    const code = error?.code ? ` (${error.code})` : "";
    return `No response from Cohere${code}: ${error?.message || error}`;
  }

  const data = response.data || {};
  let parts = [
    `Cohere HTTP ${response.status}`,
    data.error_type ? ` [${data.error_type}]` : "",
    data.message ? `: ${data.message}` : "",
  ].join("");

  const headers = response.headers || {};
  if (data.error_type === "NO_VALID_RESPONSE_GENERATED") {
    parts +=
      " — the model produced no usable output for this prompt. Retrying usually resolves it.";
  }
  if (response.status === 429) {
    const remaining = headers["x-trial-endpoint-call-remaining"];
    const limit = headers["x-trial-endpoint-call-limit"];
    parts += ` — rate limited (trial key: ${remaining ?? "?"}/${limit ?? "?"} calls left).`;
  }
  if (!data.message) {
    const raw = typeof data === "string" ? data : JSON.stringify(data);
    if (raw && raw !== "{}") parts += ` — ${raw.slice(0, 300)}`;
  }

  return parts;
}

/** True when the failure is transient and the same request can be replayed. */
function isRetryableError(error) {
  const response = error?.response;
  if (!response) return true; // network / socket / timeout
  if (RETRYABLE_STATUS_CODES.has(response.status)) return true;
  if (response.status === 422) {
    const type = response.data?.error_type;
    return !type || RETRYABLE_ERROR_TYPES.has(type);
  }
  return false;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send a prompt to Cohere and return the generated HTML string.
 *
 * @param {string} prompt            The prompt text.
 * @param {object} [options]
 * @param {string} [options.model]   Model name (default: command-a-03-2025).
 * @param {number} [options.temperature]
 * @param {number} [options.maxTokens]
 * @param {string} [options.systemPrompt] Override the default system prompt.
 * @param {string} [options.preamble] Extra user text prepended before the prompt.
 * @param {number} [options.maxRetries] Attempts after the first one (default: 3).
 * @param {number} [options.retryBaseDelayMs] Exponential backoff base (default: 4000).
 * @returns {Promise<string>} HTML text.
 */
async function generateHtml(prompt, options = {}) {
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("❌ A non-empty prompt string is required.");
  }

  const {
    model = process.env.COHERE_MODEL || DEFAULT_MODEL,
    temperature = DEFAULT_TEMPERATURE,
    maxTokens = DEFAULT_MAX_TOKENS,
    systemPrompt = HTML_SYSTEM_PROMPT,
    preamble = "",
    maxRetries = DEFAULT_MAX_RETRIES,
    retryBaseDelayMs = DEFAULT_RETRY_BASE_DELAY_MS,
  } = options;

  const userMessage = preamble
    ? `${preamble}\n\n${prompt}`
    : prompt;

  const payload = {
    model,
    messages: [
      ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
      { role: "user", content: userMessage },
    ],
    temperature,
    max_tokens: maxTokens,
  };

  const config = {
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  };

  const attempts = Math.max(0, maxRetries) + 1;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1) {
      // Exponential backoff with jitter: 4s, 8s, 16s … (+ up to 1s jitter).
      const delay = retryBaseDelayMs * 2 ** (attempt - 2);
      const wait = delay + Math.floor(Math.random() * 1000);
      console.warn(
        `⚠️  Attempt ${attempt}/${attempts} in ${Math.round(wait / 1000)}s…`,
      );
      await sleep(wait);
    }

    console.log(
      `🧠 Asking Cohere (${model})… [attempt ${attempt}/${attempts}]`,
    );

    try {
      const { data } = await axios.post(COHERE_API_URL, payload, config);

      const text =
        data?.message?.content?.map((part) => part?.text || "").join("") ?? "";

      if (!text) {
        const error = new Error(
          `❌ Cohere returned an empty response: ${JSON.stringify(data)}`,
        );
        error.response = { status: 502, data };
        throw error;
      }

      if (!/<html[\s>]/i.test(text)) {
        const error = new Error(
          "❌ Cohere response is not an HTML document.",
        );
        error.response = { status: 422, data: {} };
        error.isRetryable = true;
        throw error;
      }

      const html = extractHtml(text);
      console.log(`✅ Received ${html.length} characters of HTML.`);
      return html;
    } catch (error) {
      lastError = error;
      const retryable =
        error.isRetryable === true || isRetryableError(error);
      const message = describeCohereError(error);

      if (!retryable || attempt === attempts) {
        console.error(`❌ Cohere request failed — ${message}`);
      } else {
        console.warn(`⚠️  ${message}`);
      }

      if (!retryable) break;
    }
  }

  const err = new Error(describeCohereError(lastError));
  err.cause = lastError;
  throw err;
}

/**
 * Same as generateHtml(), but also writes the HTML to disk.
 *
 * @param {string} prompt
 * @param {string} outputPath Destination file path.
 * @param {object} [options] See generateHtml().
 * @returns {Promise<string>} The absolute path of the saved file.
 */
async function sendToCohereAndSave(prompt, outputPath, options = {}) {
  const html = await generateHtml(prompt, options);
  const absPath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, html, "utf8");
  console.log(`✅ Response saved to: ${absPath}`);
  return absPath;
}

module.exports = { generateHtml, sendToCohereAndSave };

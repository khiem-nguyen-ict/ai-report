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

  console.log(`🧠 Asking Cohere (${model})…`);

  const { data } = await axios.post(COHERE_API_URL, payload, {
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  const text =
    data?.message?.content?.map((part) => part?.text || "").join("") ?? "";

  if (!text) {
    throw new Error(
      `❌ Cohere returned an empty response: ${JSON.stringify(data)}`,
    );
  }

  const html = extractHtml(text);
  console.log(`✅ Received ${html.length} characters of HTML.`);
  return html;
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

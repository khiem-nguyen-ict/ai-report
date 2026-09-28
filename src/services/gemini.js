const { chromium } = require("playwright-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
chromium.use(StealthPlugin());

const path = require("path");
const fs = require("fs");

const USER_DATA_DIR = "./user-data";

// ── Timeout / polling config ───────────────────────────────────────────────
const STREAMING_TIMEOUT_MS = 15 * 60_000;
const POLL_INTERVAL_MS = 5000; // check every 5s
const EDITOR_READY_TIMEOUT = 60_000;
const FIRST_RESPONSE_TIMEOUT = 180_000;

let _context = null;
let _page = null;

async function closeBrowser() {
  if (_context) {
    await _context.close().catch(() => {});
    _context = null;
    _page = null;
    console.log("🔒 Browser closed.");
  }
}

// ── Browser / page management ─────────────────────────────────────────────
async function getPage() {
  if (_page && !_page.isClosed()) return _page;

  _context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    channel: "chrome",
    args: [
      //"--disable-blink-features=AutomationControlled",
      //"--disable-web-security",
    ],
    viewport: { width: 1240, height: 800 },
  });

  _page = _context.pages()[0] || (await _context.newPage());
  await _page.goto("https://gemini.google.com/app", {
    waitUntil: "domcontentloaded",
  });

  console.log(
    "⚠️  If you see a Cloudflare or login page, please complete it manually (only once).",
  );
  await waitForGeminiReady(_page);
  return _page;
}

async function waitForGeminiReady(page) {
  await page.waitForSelector(
    'div[contenteditable="true"], textarea[aria-label*="message"]',
    {
      timeout: EDITOR_READY_TIMEOUT,
    },
  );

  // Dismiss any transient banner overlays that may intercept clicks
  await dismissBanners(page);

  await page.waitForTimeout(1000);
}

async function dismissBanners(page) {
  const dismissibleSelectors = [
    "button[aria-label*='Dismiss']",
    "button[aria-label*='Close']",
    "button:has-text('Got it')",
    "button:has-text('Dismiss')",
    "button:has-text('Okay')",
    "button:has-text('Accept')",
    ".banner-body button",
    ".cdk-overlay-container button",
  ];
  for (const sel of dismissibleSelectors) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        const visible = await btn.isVisible().catch(() => false);
        if (visible) {
          await btn.click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(500);
        }
      }
    } catch (_) {}
  }
}

async function waitForLLMResponseComplete(page) {
  const start = Date.now();

  while (Date.now() - start < STREAMING_TIMEOUT_MS) {
    const result = await page
      .evaluate(() => {
        // Gemini UI (as of Sep 2026) uses <thinking-overlay> which is empty
        // when idle and populated while the model is generating.
        const overlay = document.querySelector("thinking-overlay");
        const isThinking = overlay ? overlay.childElementCount > 0 : false;

        // message-actions appears once the response is fully rendered.
        const isReady = document.querySelector("message-actions") != null;

        if (!isThinking && isReady) {
          const r = document.querySelectorAll("structured-content-container");
          if (r && r.length > 0) {
            const textElem = r[r.length - 1];
            if (textElem) {
              let text = textElem.innerText.trim();
              // Strip markdown code fences and common HTML prefixes the LLM
              // may prepend (e.g. "```html", "HTML", "```").
              text = text
                .replace(/^```(?:html)?\s*/i, "")
                .replace(/```\s*$/, "")
                .replace(/^HTML\s*/i, "")
                .trim();
              return { status: "completed", data: text };
            }
          }
          return { status: "error", message: "Cannot find out the text elem." };
        }
        return { status: "LLM is running..." };
      })
      .catch((err) => ({ status: "error", message: err.message }));

    console.log(`Current status: ${result.status}`);

    if (result.status === "completed") return result.data;
    if (result.status === "error") throw new Error(result.message);

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`❌ Timed out after ${STREAMING_TIMEOUT_MS / 1000}s.`);
}

// ── Main export ───────────────────────────────────────────────────────────
async function sendToGeminiAndDownload(prompt, outputPath) {
  const page = await getPage();

  // Focus the editor and insert prompt
  const editor = await page.waitForSelector(
    'div.ql-editor[contenteditable="true"]',
    {
      timeout: EDITOR_READY_TIMEOUT,
    },
  );

  // Dismiss any transient banner overlays that may intercept clicks
  await dismissBanners(page);

  let typed = false;
  for (let attempt = 0; attempt < 5 && !typed; attempt++) {
    try {
      await editor.click({ timeout: 5000 });
      await editor.fill(prompt);
      typed = true;
    } catch (err) {
      console.warn(`⚠️  Click attempt ${attempt + 1} failed: ${err.message}`);
      await dismissBanners(page);
      await page.waitForTimeout(1000);
    }
  }
  if (!typed) {
    // Fallback: focus via Tab/Enter and type directly
    await page.keyboard.press("Tab");
    await page.keyboard.type(prompt);
  }

  // Wait a moment to ensure the prompt is fully registered before submitting
  await page.waitForTimeout(1000);

  // Submit prompt
  await page.keyboard.press("Enter");
  console.log("📤 Prompt submitted.");

  console.log("⏳ Waiting for Gemini to start generating...");
  await page.waitForSelector("thinking-overlay", {
    timeout: FIRST_RESPONSE_TIMEOUT,
    state: "attached",
  });

  // Wait until generation stops
  const responseText = await waitForLLMResponseComplete(page);

  // Save to file
  const absPath = path.resolve(outputPath);
  fs.writeFileSync(absPath, responseText, "utf8");
  console.log(`✅ Response saved to: ${absPath}`);

  await closeBrowser();
  return absPath;
}

module.exports = { sendToGeminiAndDownload };

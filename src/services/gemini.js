const { chromium } = require("playwright");
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
      "--disable-blink-features=AutomationControlled",
      "--disable-web-security",
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
  await page.waitForTimeout(1000);
}

async function waitForGeminiResponseComplete(page) {
  const start = Date.now();

  while (Date.now() - start < STREAMING_TIMEOUT_MS) {
    const result = await page
      .evaluate(() => {
        // Gemini has changed the UI on 20-May-2026

        //const bardAvatar = document.querySelector("model-response bard-avatar div[lottie-animation]");
        //const status = bardAvatar?.getAttribute("data-test-lottie-animation-status");

        const svg = document.querySelector(
          "thinking-dots-animation .thinking-dots-animation svg",
        );

        const is3DotVisible = svg
          ? window.getComputedStyle(svg).contentVisibility === "visible"
          : false;

        // This means the response is ready completly!
        const isReady = document.querySelector("message-actions") != null;
        
        if (!is3DotVisible && isReady) {
          const r = document.querySelectorAll("structured-content-container");
          if (r && r.length > 0) {
            const textElem = r[r.length - 1];
            if (textElem) {
              let text = textElem.innerText.trim();
              text = text.replace(/^HTML/i, "").trim();
              return { status: "completed", data: text };
            }
          }
          return { status: "error", message: "Cannot find out the text elem." };
        }
        return { status: "running" };
      })
      .catch((err) => ({ status: "error", message: err.message }));

    console.log(`Current status: ${result.status}`);

    if (result.status === "completed") return result.data;
    if (result.status === "error") throw new Error(result.message);

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`❌ Timed out after ${timeout / 1000}s.`);
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
  await editor.click();
  await editor.fill(prompt);

  // Submit prompt
  await page.keyboard.press("Enter");
  console.log("📤 Prompt submitted.");

  console.log("⏳ Waiting for Gemini to finish generating...");
  await page.waitForSelector(
    "thinking-dots-animation .thinking-dots-animation svg",
    {
      timeout: FIRST_RESPONSE_TIMEOUT,
    },
  );

  //   // Wait until generation stops
  const responseText = await waitForGeminiResponseComplete(page);

  // Save to file
  const absPath = path.resolve(outputPath);
  fs.writeFileSync(absPath, responseText, "utf8");
  console.log(`✅ Response saved to: ${absPath}`);

  await closeBrowser();
  return absPath;
}

module.exports = { sendToGeminiAndDownload };

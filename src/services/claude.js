const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const USER_DATA_DIR = "./user-data";

// ── Timeout / polling config ───────────────────────────────────────────────
const STREAMING_TIMEOUT_MS = 15 * 60_000;
const POLL_INTERVAL_MS = 10_000;
const EDITOR_READY_TIMEOUT = 60000;
const FIRST_RESPONSE_TIMEOUT = 180_000;
const DOWNLOAD_TIMEOUT = 60_000;

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
  // Clean up stale browser lock files before launching
  const { cleanupStaleBrowserFiles } = require("../utils/index");
cleanupStaleBrowserFiles(USER_DATA_DIR);

  if (_page && !_page.isClosed()) return _page;

  _context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
    viewport: { width: 1240, height: 800 },
  });

  _page = await _context.newPage();
  await _page.goto("https://claude.ai", { waitUntil: "domcontentloaded" });

  console.log(
    "⚠️  If you see a Cloudflare or login page, please complete it manually (only once).",
  );
  await waitForClaudeReady(_page);
  return _page;
}

async function waitForClaudeReady(page) {
  await page.waitForSelector('div[contenteditable="true"]', {
    timeout: EDITOR_READY_TIMEOUT,
  });
  await page.waitForTimeout(1000);
}

async function waitForStreamingComplete(page) {
  const timeoutMs = STREAMING_TIMEOUT_MS;
  const start = Date.now();
  const deadline = start + timeoutMs;

  while (Date.now() < deadline) {
    await page.waitForTimeout(POLL_INTERVAL_MS);

    const elapsed = Math.round((Date.now() - start) / 1000);
    const isDone = await page
      .evaluate(() => {
        if (document.querySelectorAll('[data-is-streaming="true"]').length > 0)
          return false;

        const stopBtn =
          document.querySelector('[aria-label*="Stop"]') ||
          document.querySelector('[data-testid="stop-button"]') ||
          document.querySelector('button[aria-label="Stop response"]');
        if (stopBtn && stopBtn.offsetParent !== null) return false;

        return true;
      })
      .catch(() => false);

    if (isDone) {
      await page.waitForTimeout(2000);
      return;
    }

    console.log(`   ⏳ Still generating… (${elapsed}s elapsed)`);
  }

  throw new Error(
    `❌ Timed out after ${STREAMING_TIMEOUT_MS / 1000}s waiting for generation.`,
  );
}

// ── Find Download button ──────────────────────────────────────────────────

async function findDownloadButton(page, timeout = 20_000) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    try {
      const handle = await page.evaluateHandle(() =>
        document.querySelector('button[aria-label="Download"]'),
      );

      const element = handle.asElement();
      if (element) {
        const box = await element.boundingBox().catch(() => null);
        console.log(`   boundingBox: ${JSON.stringify(box)}`);
        if (box && box.width > 0 && box.height > 0) return element;
      }
    } catch (e) {
      console.log(`   findDownloadButton error: ${e.message}`);
    }

    await page.waitForTimeout(500);
  }

  return null;
}

// ── Main export ───────────────────────────────────────────────────────────

async function sendToClaudeAndDownload(prompt, outputPath) {
  const page = await getPage();

  await page.goto("https://claude.ai/new", { waitUntil: "domcontentloaded" });
  await waitForClaudeReady(page);

  const editor = await page.waitForSelector('div[contenteditable="true"]');
  await editor.click();
  await editor.fill("");
  await page.evaluate((text) => {
    const el = document.querySelector('div[contenteditable="true"]');
    if (!el) return;
    el.focus();
    document.execCommand("insertText", false, text);
  }, prompt);

  // Re-focus the editor and add a small delay to ensure text is properly inserted
  await editor.click();
  await page.waitForTimeout(100);

  await page.keyboard.press("Enter");
  console.log("📤 Prompt submitted.");

  console.log("⏳ Waiting for response to start…");
  await page.waitForSelector('div[class*="contents"]', {
    timeout: FIRST_RESPONSE_TIMEOUT,
  });
  console.log("   Response started. Claude is generating...");

  await waitForStreamingComplete(page);

  // ── Find and click the artifact Download button ───────────────────────
  console.log("🔍 Looking for Download button…");

  const exists = await page.evaluate(
    () => !!document.querySelector('button[aria-label="Download"]'),
  );

  let downloadButton = null;
  try {
    downloadButton = await findDownloadButton(page, 20_000);
    if (!downloadButton) throw new Error("Button not found");
  } catch {
    await page
      .screenshot({
        path: path.join(__dirname, "../../app-data/debug-no-download-btn.png"),
        fullPage: false,
      })
      .catch(() => {});
    throw new Error(
      "❌ Could not find the artifact Download button after generation completed.\n" +
        "   Screenshot saved to debug-no-download-btn.png\n" +
        "   Make sure the prompt instructs Claude to create an HTML artifact.",
    );
  }

  await downloadButton.scrollIntoViewIfNeeded();
  await page
    .screenshot({
      path: path.join(__dirname, "../../app-data/debug-before-download.png"),
      fullPage: false,
    })
    .catch(() => {});
  console.log("🖱️  Found Download button — clicking…");

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: DOWNLOAD_TIMEOUT }),
    downloadButton.click(),
  ]);

  const absPath = path.resolve(outputPath);
  await download.saveAs(absPath);
  console.log(`✅ File saved to: ${absPath}`);

  await closeBrowser();

  return absPath;
}

module.exports = { sendToClaudeAndDownload };

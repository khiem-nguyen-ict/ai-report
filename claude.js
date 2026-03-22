const { chromium } = require("playwright");
const path = require("path");

const USER_DATA_DIR = "./user-data";

// ── Timeout / polling config ───────────────────────────────────────────────
const STREAMING_TIMEOUT_MS = 5 * 60_000; // 5 minutes max wait for generation
const POLL_INTERVAL_MS = 15_000; // check every 15 seconds
const EDITOR_READY_TIMEOUT = 0; // no timeout — wait as long as needed for login
const FIRST_RESPONSE_TIMEOUT = 90_000; // 90s for the first response container to appear
const DOWNLOAD_TIMEOUT = 60_000; // 60s to receive the download after clicking

let _context = null;
let _page = null;

// ── Browser / page management ─────────────────────────────────────────────

async function getPage() {
  if (_page && !_page.isClosed()) return _page;

  _context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
    viewport: { width: 1440, height: 900 },
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
  }
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

  await page.keyboard.press("Enter");
  console.log("📤 Prompt submitted.");

  console.log("⏳ Waiting for response to start…");
  await page.waitForSelector('div[class*="contents"]', {
    timeout: FIRST_RESPONSE_TIMEOUT,
  });
  console.log("   Response started.");

  await waitForStreamingComplete(page);

  // ── Find and click the artifact Download button ───────────────────────
  console.log("🔍 Looking for Download button…");

  // DEBUG: Check if button exists in DOM
  const exists = await page.evaluate(
    () => !!document.querySelector('button[aria-label="Download"]'),
  );

  let downloadButton = null;
  try {
    downloadButton = await findDownloadButton(page, 20_000);
    if (!downloadButton) throw new Error("Button not found");
  } catch {
    await page
      .screenshot({ path: "debug-no-download-btn.png", fullPage: false })
      .catch(() => {});
    throw new Error(
      "❌ Could not find the artifact Download button after generation completed.\n" +
        "   Screenshot saved to debug-no-download-btn.png\n" +
        "   Make sure the prompt instructs Claude to create an HTML artifact.",
    );
  }

  await downloadButton.scrollIntoViewIfNeeded();
  await page
    .screenshot({ path: "debug-before-download.png", fullPage: false })
    .catch(() => {});
  console.log("🖱️  Found Download button — clicking…");

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: DOWNLOAD_TIMEOUT }),
    downloadButton.click(),
  ]);

  const absPath = path.resolve(outputPath);
  await download.saveAs(absPath);
  console.log(`✅ File saved to: ${absPath}`);

  return absPath;
}

module.exports = { sendToClaudeAndDownload };

// ── Standalone mode ───────────────────────────────────────────────────────
if (require.main === module) {
  const prompt =
    process.argv.slice(2).join(" ") ||
    "Create a simple HTML hello world page as an artifact.";

  (async () => {
    try {
      const filePath = await sendToClaudeAndDownload(prompt, "output.html");
      console.log(`\n📁 Saved to: ${filePath}`);
    } catch (err) {
      console.error(err);
    } finally {
      // ── Close the browser/context before exiting ────────────────────────
      if (_context) {
        console.log("Cleanup: Closing browser...");
        await _context.close();
      }
    }
  })();
}

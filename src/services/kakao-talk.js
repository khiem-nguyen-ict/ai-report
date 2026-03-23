const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const { chromium } = require("playwright");

const USER_DATA_DIR = "./user-data"; // keeps login session
const KAKAO_URL = process.env.KAKAO_URL || "https://open.kakao.com/o/gJhErE6h";
const KAKAO_CHAT_NAME = process.env.KAKAO_CHAT_NAME || "[Insignary-TMA] AI Dev";
const TIMEOUT = 30_000;

async function run() {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    channel: "chrome",
    viewport: null,
  });

  const page = context.pages()[0] || await context.newPage();
  page.setDefaultTimeout(TIMEOUT);

  try {
    // 1. Open KakaoTalk Web
    console.log("🚀 Opening KakaoTalk Web...");
    await page.goto(KAKAO_URL, { waitUntil: "domcontentloaded", timeout: TIMEOUT });

    // 2. Detect login state
    const needLogin = await page
      .locator('a[href*="login"], button:has-text("로그인"), button:has-text("Login")')
      .isVisible()
      .catch(() => false);

    if (needLogin) {
      console.log("⚠️  Login required. Please login in the browser...");
      console.log("👉 After logging in, press Enter here to continue.");
      await new Promise((r) => process.stdin.once("data", r));
      console.log("✅ Session saved! From next time, login will be automatic.");
    } else {
      console.log("✅ Already logged in!");
    }

    // 3. Wait for chat list UI to be ready
    await page.waitForSelector("body");

    // 4. Try to search for the chat channel
    const searchBox = page
      .locator("input[type='search'], input[placeholder*='Search'], input[placeholder*='검색']")
      .first();

    if (await searchBox.count()) {
      await searchBox.fill(KAKAO_CHAT_NAME);
      await page.waitForTimeout(2000);
    }

    // 5. Click the chat
    const chatItem = page.locator(`text=${KAKAO_CHAT_NAME}`).first();
    await chatItem.waitFor({ state: "visible", timeout: TIMEOUT });
    await chatItem.click();

    console.log("✅ Chat opened:", KAKAO_CHAT_NAME);

    // 6. Find message input box
    const inputBox = page.locator("textarea, div[contenteditable='true']").last();
    await inputBox.waitFor({ state: "visible" });

    // 7. Paste message (DO NOT SEND — manual review required)
    const message = `Hello team,\nThis is a test message from Playwright.\n(Do not send yet)`;

    await inputBox.click();
    await inputBox.fill(message);

    console.log("✍️  Message pasted. Waiting 10 minutes for your review...");
    console.log("👉 Press Enter in the terminal to close the browser early.");

    // 8. Keep browser open for review — or press Enter to quit early
    await Promise.race([
      page.waitForTimeout(600_000),
      new Promise((r) => process.stdin.once("data", r)),
    ]);

  } catch (err) {
    console.error("❌ Error:", err.message);
    await page.screenshot({ path: "kakao-error.png", fullPage: true }).catch(() => {});
    console.log("📸 Screenshot saved: kakao-error.png");
    throw err;
  } finally {
    await context.close();
    console.log("🔒 Browser closed.");
  }
}

module.exports = { run };

if (require.main === module) {
  run().catch(console.error);
}

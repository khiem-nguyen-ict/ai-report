const { chromium } = require("playwright");

const USER_DATA_DIR = "./user-data"; // keeps login session

async function run() {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    channel: "chrome",
    viewport: null,
  });

  const page = await context.newPage();

  // 1. Open KakaoTalk Web
  await page.goto("https://open.kakao.com/o/gJhErE6h"); 
  // NOTE: KakaoTalk web UI changes depending on region/account.
  // If you use another URL, replace it here.

  console.log("👉 Please login manually if needed...");
  await page.waitForTimeout(60000); // give time to login (first run)

  // 2. Wait for chat list UI
  await page.waitForSelector("body");

  // 3. Search for chat channel
  const chatName = "[Insignary-TMA] AI Dev";

  // Try search box (adjust selector if needed)
  const searchBox = await page.locator("input[type='search'], input[placeholder*='Search']").first();

  if (await searchBox.count()) {
    await searchBox.fill(chatName);
    await page.waitForTimeout(2000);
  }

  // 4. Click the chat
  const chatItem = page.locator(`text=${chatName}`).first();
  await chatItem.waitFor({ timeout: 15000 });
  await chatItem.click();

  console.log("✅ Chat opened");

  // 5. Find message input box
  const inputBox = page.locator("textarea, div[contenteditable='true']").last();
  await inputBox.waitFor();

  // 6. Paste message (DO NOT SEND)
  const message = `Hello team,
This is a test message from Playwright.
(Do not send yet)`;

  await inputBox.click();
  await inputBox.fill(message);

  console.log("✍️ Message pasted. Waiting for your review...");

  // 7. Keep browser open for manual review
  await page.waitForTimeout(600000); // 10 minutes
}

run();

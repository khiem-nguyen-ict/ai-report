/**
 * send-mail.js
 * Send email via Zimbra Classic Webmail using Playwright.
 * - First time: Manual login required, session will be saved.
 * - Subsequent times: Automatically uses saved session, no re-login needed.
 *
 * Setup:
 * npm install playwright dotenv
 * npx playwright install chromium
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { execSync } = require("child_process");

// ─────────────────────────────────────────────
//  CONFIGURATION
// ─────────────────────────────────────────────
const CONFIG = {
  zimbraUrl: process.env.ZIMBRA_URL || "https://webmail.tma.com.vn",
  fromName: process.env.FROM_NAME || "Khiem Nguyen Thanh",
  sessionDir: path.resolve(__dirname, ".zimbra-session"), // store cookies/session
};

// ─────────────────────────────────────────────
//  RECIPIENT LIST — read from .env
//  Format: RECIPIENTS=Name1:email1,Name2:email2
// ─────────────────────────────────────────────
const RECIPIENT_LIST = (process.env.RECIPIENTS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => {
    const [name, email] = s.split(":").map((p) => p.trim());
    return { name: name || email, email };
  });

if (RECIPIENT_LIST.length === 0) {
  console.error("❌ RECIPIENTS not configured in .env");
  console.error(
    "   Example: RECIPIENTS=Nguyen Van A:a@tma.com.vn,Tran Thi B:b@tma.com.vn",
  );
  process.exit(1);
}

function loadHtmlBody(target) {
  if (!target) {
    throw new Error("HTML file path not provided.");
  }
  if (!fs.existsSync(target)) {
    throw new Error(`File not found: ${target}`);
  }
  const html = fs.readFileSync(target, "utf-8");
  return { html, filePath: path.resolve(target) };
}

// ─────────────────────────────────────────────
//  CHECK IF LOGGED IN
// ─────────────────────────────────────────────
async function isLoggedIn(page) {
  try {
    await page.waitForFunction(
      () => {
        if (document.title === "Zimbra Web Client Sign In") return false;
        if (window.location.href.includes("loginOp")) return false;
        return (
          document.querySelector(
            "div[id^='zb__App'], #ztb__App, div.ZmAppToolBar",
          ) !== null
        );
      },
      { timeout: 6000, polling: 500 },
    );
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
//  WAIT FOR LOGIN (show login URL, wait for user action)
// ─────────────────────────────────────────────
async function waitForLogin(page) {
  // Wait for URL to change from login page
  await page.waitForFunction(
    () =>
      !window.location.href.includes("loginOp") &&
      !window.location.href.includes("/login") &&
      document.title !== "Zimbra Web Client Sign In",
    { timeout: 180000, polling: 1000 },
  );
  // Wait for "Loading..." to disappear and toolbar to appear
  await page.waitForFunction(
    () => {
      const loading = document.querySelector(".ZLoadingMsg, #skin_loading_div");
      if (loading && loading.offsetParent !== null) return false; // still loading
      // Check if toolbar or Compose button has appeared
      return (
        document.querySelector(
          "div[id^='zb__App'], #ztb__App, div.ZmAppToolBar",
        ) !== null
      );
    },
    { timeout: 60000, polling: 500 },
  );
  await page.waitForTimeout(1500);
}

// ─────────────────────────────────────────────
//  COMPOSE AND SEND EMAIL (Zimbra Classic) — fallback
// ─────────────────────────────────────────────
async function composeAndSend(
  page,
  browser,
  recipients,
  date,
  resolvedHtmlFilePath,
) {
  // Click "New Message" button
  // Zimbra Classic uses various selectors depending on version
  const newMsgSelectors = [
    "div[id$='__NEW_MENU']",
    "td[id$='__COMPOSE']",
    "div[id$='__COMPOSE']",
    "div.ZToolbarButton:has-text('New Message')",
    "td.ZToolbarButton:has-text('New Message')",
  ];

  const EMAIL_SUBJECT = `[${process.env.COMPANY}][${process.env.CLIENT}] ${process.env.PROJECT} - Daily Report on ${date}`;

  let clicked = false;
  for (const sel of newMsgSelectors) {
    const btn = page.locator(sel).first();
    if ((await btn.count()) > 0) {
      await btn.click();
      clicked = true;
      console.log(`  🖱️  Clicked Compose (selector: ${sel})`);
      break;
    }
  }
  if (!clicked) throw new Error("Could not find New Message/Compose button");

  await page.waitForTimeout(2000);

  // Fill To field
  const toSelectors = [
    "input[id^='zv__COMPOSE'][id$='_to_control']",
    "input[class*='addrInput'][aria-label*='To']",
    "textarea[id$='_to_control']",
    "div[id^='zv__COMPOSE'] input[type='text']",
  ];
  let toFilled = false;

  const strRep = recipients.map((r) => `"${r.name}" <${r.email}>`).join(";");

  for (const sel of toSelectors) {
    const field = page.locator(sel).first();
    if ((await field.count()) > 0) {
      await field.click();
      await field.fill(strRep);
      await field.press("Tab");
      toFilled = true;
      console.log(`  ✍️  Filled To (selector: ${sel})`);
      break;
    }
  }
  if (!toFilled) throw new Error("Could not find To input field");
  await page.waitForTimeout(500);

  // Fill Subject field
  const subjectSelectors = [
    "input[id^='zv__COMPOSE'][id$='_subject']",
    "input[id*='_subject']",
    "input[aria-label*='Subject']",
  ];
  let subjectFilled = false;
  for (const sel of subjectSelectors) {
    const field = page.locator(sel).first();
    if ((await field.count()) > 0) {
      await field.click();
      await field.fill(EMAIL_SUBJECT);
      subjectFilled = true;
      console.log(`  ✍️  Filled Subject (selector: ${sel})`);
      break;
    }
  }
  if (!subjectFilled) throw new Error("Could not find Subject field");
  await page.waitForTimeout(500);

  // Open HTML file in new tab → Cmd+A → Cmd+C → paste into editor
  const htmlFileUrl = `file://${resolvedHtmlFilePath}`;

  // Step 1: Open HTML file in new tab
  const htmlPage = await browser.newPage();
  await htmlPage.bringToFront();
  await htmlPage.goto(htmlFileUrl, { waitUntil: "networkidle" });
  await htmlPage.waitForTimeout(800);
  console.log("  📄 Opened HTML file in a new tab");

  // Step 2: Cmd+A (Select All) then Cmd+C (Copy)
  await htmlPage.keyboard.press("Meta+a");
  await htmlPage.waitForTimeout(300);
  await htmlPage.keyboard.press("Meta+c");
  await htmlPage.waitForTimeout(300);
  console.log("  📋 Executed Cmd+A + Cmd+C on HTML content");

  // Step 3: Close HTML tab
  await htmlPage.close();

  // Step 4: Click into editor iframe then Cmd+A + Cmd+V
  const editorFrame = page
    .frameLocator("iframe[id^='ZmHtmlEditor'], iframe[class*='ZmHtmlEditor']")
    .first();
  const editorBody = editorFrame.locator("body");

  if ((await editorBody.count()) > 0) {
    await editorBody.click();
    await page.waitForTimeout(300);
    await editorBody.press("Meta+a"); // Clear old content
    await page.waitForTimeout(200);
    await editorBody.press("Meta+v"); // Paste from clipboard
    await page.waitForTimeout(800);
    console.log("  ✍️  Pasted content into Zimbra editor");
  } else {
    throw new Error("Could not find email body editor (iframe)");
  }
  await page.waitForTimeout(500);

  // Click Send button
  const sendSelectors = [
    "td[id^='zb__COMPOSE'][id$='__SEND_MENU_title']", 
    "td[id$='__SEND_MENU_title']",
    "div[id$='__SEND_MENU']",
    "td[id$='__SEND_MENU']",
    "div[id^='zb__COMPOSE'][id$='_SEND']",
    "td[id^='zb__COMPOSE'][id$='_SEND']",
  ];
  let sent = false;
  for (const sel of sendSelectors) {
    try {
      const btn = page.locator(sel).first();
      if ((await btn.count()) > 0 && (await btn.isVisible())) {
        await btn.click({ timeout: 5000 });
        sent = true;
        console.log(`  🚀 Clicked Send (selector: ${sel})`);
        break;
      }
    } catch {
      continue;
    }
  }
  if (!sent) {
    // Log visible buttons in compose area for debugging
    const allBtns = await page
      .locator("button, div[role=button], td[role=button]")
      .all();
    const visible = [];
    for (const b of allBtns) {
      if (await b.isVisible()) {
        const txt = ((await b.textContent()) || "").trim();
        if (txt) visible.push(txt);
      }
    }
    console.log("  🔍 Visible buttons:", visible.slice(0, 15));
    throw new Error("Could not find Send button");
  }

  // Wait for compose window to close
  await page.waitForTimeout(3000);
}

// ─────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────
async function run(date, reportFile) {
  console.log("=== Zimbra Classic Sender (Playwright) ===\n");

  let htmlBody, resolvedFilePath;
  try {
    const result = loadHtmlBody(reportFile);
    htmlBody = result.html;
    resolvedFilePath = result.filePath;
  } catch (err) {
    console.error("❌ Error reading HTML file:", err.message);
    process.exit(1);
  }

  // Use persistent context to save session
  const browser = await chromium.launchPersistentContext(CONFIG.sessionDir, {
    headless: false,
    slowMo: 80,
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 800 },
    permissions: ["clipboard-read", "clipboard-write"],
    args: [
      "--unsafely-treat-insecure-origin-as-secure=https://webmail.tma.com.vn",
    ],
  });

  const page = browser.pages()[0] || (await browser.newPage());

  try {
    // Navigate to webmail
    console.log(`🌐 Opening: ${CONFIG.zimbraUrl}`);
    await page.goto(CONFIG.zimbraUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // Check login status
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      await waitForLogin(page);
    } else {
      console.log("✅ Using existing session — no login required.\n");
    }

    // Start sending email
    console.log(
      `\n📧 Starting to send to ${RECIPIENT_LIST.length} recipients...\n`,
    );

    try {
      await composeAndSend(
        page,
        browser,
        RECIPIENT_LIST,
        date,
        resolvedFilePath,
      );
      console.log(`  ✅ Email sent successfully!\n`);
    } catch (err) {
      console.error(`  ❌ Failed to send email: ${err.message}\n`);
      await page.screenshot({ path: "error-screenshot.png" });
      console.log("  📸 Screenshot saved: error-screenshot.png");
    }
  } finally {
    await browser.close(); 
  }
}

module.exports = { run };
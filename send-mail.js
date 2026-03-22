/**
 * send-mail.js
 * Gửi email qua Zimbra Classic Webmail bằng Playwright.
 * - Lần đầu: bạn tự đăng nhập, session được lưu lại.
 * - Lần sau: tự động dùng session cũ, không cần đăng nhập lại.
 *
 * Cài đặt:
 *   npm install playwright dotenv
 *   npx playwright install chromium
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { execSync } = require("child_process");

// ─────────────────────────────────────────────
//  CẤU HÌNH
// ─────────────────────────────────────────────
const CONFIG = {
  zimbraUrl: process.env.ZIMBRA_URL || "https://webmail.tma.com.vn",
  fromName: process.env.FROM_NAME || "Khiem Nguyen Thanh",
  sessionDir: path.resolve(__dirname, ".zimbra-session"), // lưu cookie/session
};

// ─────────────────────────────────────────────
//  DANH SÁCH NGƯỜI NHẬN — đọc từ .env
//  Định dạng: RECIPIENTS=Name1:email1,Name2:email2
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
//  KIỂM TRA ĐÃ ĐĂNG NHẬP CHƯA
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
//  COMPOSE VÀ GỬI EMAIL (Zimbra Classic) — fallback
// ─────────────────────────────────────────────
async function composeAndSend(
  page,
  browser,
  recipients,
  date,
  resolvedHtmlFilePath,
) {
  // Bấm nút "New Message"
  // Zimbra Classic dùng nhiều dạng selector khác nhau tuỳ version
  const newMsgSelectors = [
    "div[id$='__NEW_MENU']",
    "td[id$='__COMPOSE']",
    "div[id$='__COMPOSE']",
    "div.ZToolbarButton:has-text('New Message')",
    "td.ZToolbarButton:has-text('New Message')",
  ];

  const EMAIL_SUBJECT = `[${process.env.COMPANY}][${process.env.CLIENT}] ${process.env.PROJECT} - Daily Report on ${date}`; // (Week #14, Sprint #6)`;

  let clicked = false;
  for (const sel of newMsgSelectors) {
    const btn = page.locator(sel).first();
    if ((await btn.count()) > 0) {
      await btn.click();
      clicked = true;
      console.log(`  🖱️  Bấm Compose (selector: ${sel})`);
      break;
    }
  }
  if (!clicked) throw new Error("Không tìm thấy nút New Message/Compose");

  await page.waitForTimeout(2000);

  // Điền To
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
      console.log(`  ✍️  Điền To (selector: ${sel})`);
      break;
    }
  }
  if (!toFilled) throw new Error("Không tìm thấy ô nhập địa chỉ To");
  await page.waitForTimeout(500);

  // Điền Subject
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
      console.log(`  ✍️  Điền Subject (selector: ${sel})`);
      break;
    }
  }
  if (!subjectFilled) throw new Error("Không tìm thấy ô Subject");
  await page.waitForTimeout(500);

  // Mở file HTML trong tab mới → Cmd+A → Cmd+C → paste vào editor
  // Đúng y hệt người dùng mở file, select all, copy, paste
  const htmlFileUrl = `file://${resolvedHtmlFilePath}`;

  // Bước 1: mở file HTML trong tab mới (tab hiện ra để copy đúng)
  const htmlPage = await browser.newPage();
  await htmlPage.bringToFront();
  await htmlPage.goto(htmlFileUrl, { waitUntil: "networkidle" });
  await htmlPage.waitForTimeout(800);
  console.log("  📄 Đã mở file HTML trong tab mới");

  // Bước 2: Cmd+A (chọn tất cả) rồi Cmd+C (copy)
  await htmlPage.keyboard.press("Meta+a");
  await htmlPage.waitForTimeout(300);
  await htmlPage.keyboard.press("Meta+c");
  await htmlPage.waitForTimeout(300);
  console.log("  📋 Đã Cmd+A + Cmd+C nội dung file HTML");

  // Bước 3: đóng tab HTML
  await htmlPage.close();

  // Bước 4: click vào editor iframe rồi Cmd+A + Cmd+V
  const editorFrame = page
    .frameLocator("iframe[id^='ZmHtmlEditor'], iframe[class*='ZmHtmlEditor']")
    .first();
  const editorBody = editorFrame.locator("body");

  if ((await editorBody.count()) > 0) {
    await editorBody.click();
    await page.waitForTimeout(300);
    await editorBody.press("Meta+a"); // xóa nội dung cũ
    await page.waitForTimeout(200);
    await editorBody.press("Meta+v"); // paste từ clipboard
    await page.waitForTimeout(800);
    console.log("  ✍️  Đã paste vào Zimbra editor");
  } else {
    throw new Error("Không tìm thấy email body editor (iframe)");
  }
  await page.waitForTimeout(500);

  // Bấm Send — tìm trong compose toolbar, tránh nhầm với email list
  // Từ screenshot: nút Send nằm trong toolbar của compose window
  const sendSelectors = [
    "td[id^='zb__COMPOSE'][id$='__SEND_MENU_title']", // Zimbra Classic: td title
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
        console.log(`  🚀 Bấm Send (selector: ${sel})`);
        break;
      }
    } catch {
      continue;
    }
  }
  if (!sent) {
    // Log tất cả buttons đang visible trong compose area để debug
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
    console.log("  🔍 Buttons đang visible:", visible.slice(0, 15));
    throw new Error("Không tìm thấy nút Send");
  }

  // Chờ compose window đóng
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
    console.error("❌ Lỗi đọc file HTML:", err.message);
    process.exit(1);
  }

  // Dùng persistent context để lưu session
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
    // Thử vào thẳng webmail
    console.log(`🌐 Mở: ${CONFIG.zimbraUrl}`);
    await page.goto(CONFIG.zimbraUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // Kiểm tra đã login chưa
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      await waitForLogin(page);
    } else {
      console.log("✅ Dùng session cũ — không cần đăng nhập lại.\n");
    }

    // Gửi email qua Playwright UI
    console.log(
      `\n📧 Bắt đầu gửi đến ${RECIPIENT_LIST.length} người nhận...\n`,
    );

    try {
      await composeAndSend(
        page,
        browser,
        RECIPIENT_LIST,
        date,
        resolvedFilePath,
      );
      console.log(`  ✅ Gửi mail thành công!\n`);
    } catch (err) {
      console.error(`  ❌ Gởi mail lỗi: ${err.message}\n`);
      results.failed.push({ email: recipient.email, error: err.message });
      await page.screenshot({ path: "error-screenshot.png" });
      console.log("  📸 Đã lưu screenshot: error-screenshot.png");
    }
  } finally {
    // await browser.close(); // session đã được lưu vào .zimbra-session/
  }
}

module.exports = { run };

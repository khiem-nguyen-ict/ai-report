require("dotenv").config();

const { chromium } = require("playwright");
const fs = require("fs");

const PROFILE_DIR = "./teams-profile";
const GROUP_NAME =  process.env.GROUP_NAME || "Mini Insignary Internal";
const TIMEOUT = 30_000; // ⏱️ 30s cho từng thao tác click / list
const SHELL_TIMEOUT = 120_000; // Teams SPA hay load lâu / nhiều kết nối mạng
/** Số lần cuộn lên tối đa để lazy-load thêm tin cùng ngày (đủ cho ~1 ngày chat). */
const MAX_CHAT_SCROLL_UP = process.env.MAX_CHAT_SCROLL_UP || 5;

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Nút Chat trên rail (Teams work + personal, UI đổi data-tid theo bản). */
function chatNavLocator(page) {
  return page
    .locator('[data-tid="app-bar-chat"]')
    .or(page.locator('[data-tid="app-bar-item-chat"]'))
    .or(page.getByRole("button", { name: /^Chat$/i }))
    .or(page.getByRole("tab", { name: /^Chat$/i }))
    .or(page.locator('[aria-label="Chat"][role="button"]'))
    .or(page.locator('button[aria-label="Chat"]'));
}

/** Sidebar + app đã sẵn sàng (sau login / reload). */
async function waitForTeamsShell(page) {
  await chatNavLocator(page).first().waitFor({
    state: "visible",
    timeout: SHELL_TIMEOUT,
  });
}

/**
 * Màn chọn Work/School vs Personal: không click (DOM hay đổi) — gửi 1 phím Enter
 * để chọn phần tử đang focus mặc định của Microsoft.
 */
async function choosePersonalMicrosoftAccountIfShown(page, waitMs = 18_000) {
  const emailInput = page.locator('input#i0116, input[name="loginfmt"]');
  const pickerHint = page.getByText(
    /Work or school account|Personal Microsoft account|Tài khoản cơ quan|Tài khoản Microsoft cá nhân/i
  );

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (!/login\.microsoftonline\.com/i.test(page.url())) {
      await page.waitForTimeout(300);
      continue;
    }
    if (await emailInput.isVisible().catch(() => false)) {
      return false;
    }
    try {
      await pickerHint.first().waitFor({ state: "visible", timeout: 2500 });
    } catch {
      await page.waitForTimeout(400);
      continue;
    }
    if (await emailInput.isVisible().catch(() => false)) {
      return false;
    }
    await page.waitForTimeout(500);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
    return true;
  }
  return false;
}

/**
 * Menu chọn tenant (Fluent): tự bấm mục Personal khi thấy
 * `role="menuitem"` có con `[data-tid="personal-tenant"]` (vd. `data-tid="pick-tenant-0"`).
 */
async function clickPersonalTenantMenuIfShown(page, waitMs = 25_000) {
  const personalItem = page
    .locator('[role="menuitem"]')
    .filter({ has: page.locator('[data-tid="personal-tenant"]') })
    .first();

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (await personalItem.isVisible().catch(() => false)) {
      await personalItem.click({ timeout: TIMEOUT });
      await page.waitForTimeout(1000);
      console.log("✅ Đã chọn tenant Personal (menu Fluent).");
      return true;
    }
    await page.waitForTimeout(400);
  }
  return false;
}

async function run() {
  const slowMo = Number(process.env.PLAYWRIGHT_SLOWMO || "300");
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    slowMo,
    viewport: { width: 1440, height: 900 },
    args: ["--no-sandbox"],
  });

  const page = context.pages()[0] || await context.newPage();

  // Set timeout mặc định 2 phút cho tất cả actions
  page.setDefaultTimeout(TIMEOUT);
  page.setDefaultNavigationTimeout(TIMEOUT);

  console.log("🚀 Mở Teams...");
  // Teams giữ WebSocket → networkidle dễ không ổn; chờ DOM rồi chờ rail Chat.
  await page.goto("https://teams.microsoft.com", {
    waitUntil: "domcontentloaded",
    timeout: TIMEOUT,
  });
  await page.waitForTimeout(6000);

  // Danh sách tenant Fluent (Personal / Work) — bấm Personal nếu hiện.
  let pickedPersonalTenant = await clickPersonalTenantMenuIfShown(page);
  // Màn login.microsoftonline.com Work/School vs Personal — Enter nếu còn gặp.
  await choosePersonalMicrosoftAccountIfShown(page);
  if (!pickedPersonalTenant) {
    pickedPersonalTenant = await clickPersonalTenantMenuIfShown(page, 12_000);
  }

  // Kiểm tra đã login chưa
  const needLogin = await page
    .locator('input[type="email"], [data-tid="signin-button"]')
    .isVisible()
    .catch(() => false);

  if (needLogin) {
    console.log("⚠️  Lần đầu cần login thủ công trong browser...");
    console.log("👉 Sau khi login xong, nhấn Enter ở đây để tiếp tục.");
    // Không có timeout — chờ bạn nhấn Enter bao lâu cũng được
    await new Promise((r) => process.stdin.once("data", r));
    console.log("✅ Đã lưu session! Từ lần sau sẽ tự động login.");
  } else {
    console.log("✅ Đã login sẵn, không cần login lại!");
  }

  try {
    await waitForTeamsShell(page);
  } catch (e) {
    console.error("❌ Không thấy nút Chat (shell Teams). URL hiện tại:", page.url());
    await page.screenshot({ path: "teams-shell-timeout.png", fullPage: true }).catch(() => {});
    throw e;
  }

  // --- Chat → mở đúng group theo tên ---
  await openGroupChat(page, GROUP_NAME);
  await page.waitForTimeout(2000);

  // --- Cuộn thread để load thêm lịch sử, gom tin rồi chỉ giữ ngày cuối cùng ---
  const messages = await scrollThreadAndCollectLastDayMessages(page);

  // In ra terminal
  console.log(`\n✅ ${messages.length} messages ngày cuối cùng:\n`);
  messages.forEach((m) => {
    console.log(`👤 ${m.author}  🕐 ${m.time}`);
    console.log(`   ${m.text.replace(/\n/g, "\n   ")}`);
    console.log("─".repeat(60));
  });

  // Lưu file
  fs.writeFileSync("messages.json", JSON.stringify(messages, null, 2));
  fs.writeFileSync(
    "messages.txt",
    messages.map((m) => `[${m.time}] ${m.author}:\n${m.text}`).join("\n\n---\n\n")
  );
  console.log("\n📁 Đã lưu messages.json + messages.txt");

  await context.close();
}

/** Bấm Chat trên app bar rồi chọn cuộc trò chuyện/group khớp tên. */
async function openGroupChat(page, name) {
  await chatNavLocator(page).first().click({ timeout: TIMEOUT });
  await page.waitForTimeout(1200);

  const re = new RegExp(escapeRegex(name), "i");
  const byListItem = page.locator('[data-tid="chat-list-item"]').filter({ hasText: re });
  const byTree = page.getByRole("treeitem", { name: re });

  const groupItem = byListItem.first().or(byTree.first());
  await groupItem.waitFor({ state: "visible", timeout: TIMEOUT });
  await groupItem.scrollIntoViewIfNeeded();
  await groupItem.click({ timeout: TIMEOUT });
}

/** Danh sách tin (Fluent UI / Teams mới): runway cuộn + từng bubble `chat-pane-message`. */
function messageListLocator(page) {
  return page.locator("#chat-pane-list, [data-tid='message-pane-list-runway']").first();
}

async function waitForMessagePane(page) {
  try {
    await messageListLocator(page).waitFor({ state: "visible", timeout: 25_000 });
    await page
      .locator('[data-tid="chat-pane-message"]')
      .first()
      .waitFor({ state: "visible", timeout: TIMEOUT });
  } catch {
    await page.locator('[data-tid="messageThread"]').first().waitFor({
      state: "visible",
      timeout: SHELL_TIMEOUT,
    });
  }
}

/** Đọc toàn bộ tin trong DOM hiện tại (chưa lọc ngày). Hỗ trợ Teams Fluent + bản cũ messageThread. */
async function extractMessagesFromDom(page) {
  return page.evaluate(() => {
    const results = [];

    /** Ưu tiên `<time datetime>`, rồi `title` (Teams hay gắn ISO đầy đủ ở đây). */
    function pickTimeRaw(msgEl, wrap) {
      const ordered = [];
      const add = (root) => {
        if (!root?.querySelectorAll) return;
        root.querySelectorAll("time").forEach((t) => {
          if (!ordered.includes(t)) ordered.push(t);
        });
      };
      add(msgEl);
      add(msgEl?.parentElement);
      add(wrap);
      const el = ordered.find((t) => t.getAttribute("datetime")) || ordered[0];
      if (!el) return { timeStr: "", rawDate: "" };
      const datetime = el.getAttribute("datetime");
      const title = el.getAttribute("title");
      const text = el.textContent?.trim() || "";
      const rawDate = datetime || title || text;
      return { timeStr: datetime || title || text, rawDate };
    }

    const fluentRoot =
      document.querySelector("#chat-pane-list") ||
      document.querySelector('[data-tid="message-pane-list-runway"]');

    if (fluentRoot) {
      const bubbleText = (msgEl) => {
        const body = msgEl.querySelector("[data-message-content]");
        if (body) {
          const t = body.innerText?.trim();
          if (t) return t;
        }
        const clone = msgEl.cloneNode(true);
        clone.querySelectorAll?.('[data-tid="message-author-name"]').forEach((n) => n.remove());
        clone.querySelectorAll?.("time").forEach((n) => n.remove());
        const t = clone.innerText?.replace(/\s+\n/g, "\n").trim();
        return t || "";
      };

      const leafBubblesIn = (root) =>
        Array.from(root.querySelectorAll('[data-tid="chat-pane-message"]')).filter(
          (el) => !el.querySelector('[data-tid="chat-pane-message"]')
        );

      const covered = new Set();

      // Theo từng hàng chat: meeting card + rich text thường gắn đúng một `message-wrapper`.
      fluentRoot.querySelectorAll('[data-testid="message-wrapper"]').forEach((wrap) => {
        if (!fluentRoot.contains(wrap)) return;
        const author = wrap.querySelector('[data-tid="message-author-name"]')?.innerText?.trim();
        if (!author) return;

        const bubbles = leafBubblesIn(wrap);
        if (bubbles.length) {
          bubbles.forEach((msgEl) => {
            covered.add(msgEl);
            const text = bubbleText(msgEl);
            if (!text) return;
            const { timeStr, rawDate } = pickTimeRaw(msgEl, wrap);
            results.push({
              author,
              time: timeStr,
              rawDate: rawDate || timeStr,
              text,
            });
          });
          return;
        }

        const clone = wrap.cloneNode(true);
        clone.querySelectorAll('[data-tid="message-author-name"]').forEach((n) => n.remove());
        clone.querySelectorAll("time").forEach((n) => n.remove());
        const text = clone.innerText?.replace(/\s+\n/g, "\n").trim();
        if (!text) return;
        const { timeStr, rawDate } = pickTimeRaw(null, wrap);
        results.push({
          author,
          time: timeStr,
          rawDate: rawDate || timeStr,
          text,
        });
      });

      // Bubble không nằm trong wrapper (hiếm) — vẫn gom.
      leafBubblesIn(fluentRoot).forEach((msgEl) => {
        if (covered.has(msgEl)) return;
        const wrap = msgEl.closest('[data-testid="message-wrapper"]');
        const author =
          wrap?.querySelector('[data-tid="message-author-name"]')?.innerText?.trim() || "";
        if (!author) return;
        const text = bubbleText(msgEl);
        if (!text) return;
        const { timeStr, rawDate } = pickTimeRaw(msgEl, wrap);
        results.push({
          author,
          time: timeStr,
          rawDate: rawDate || timeStr,
          text,
        });
      });

      return results;
    }

    const thread = document.querySelector('[data-tid="messageThread"]');
    if (!thread) return results;

    thread.querySelectorAll('[role="listitem"]').forEach((el) => {
      const author = el
        .querySelector('[data-tid="message-author-name"], [class*="authorName"]')
        ?.innerText?.trim();
      const timeEl = el.querySelector("time");
      const body = el.querySelector(
        '[data-tid="message-body-content"], [class*="messageBody"]'
      );
      if (!body || !author) return;
      const text = body.innerText?.trim();
      if (!text) return;
      const raw =
        timeEl?.getAttribute("datetime") ||
        timeEl?.getAttribute("title") ||
        timeEl?.innerText ||
        "";
      results.push({
        author,
        time: timeEl?.getAttribute("datetime") || timeEl?.innerText || "",
        rawDate: raw,
        text,
      });
    });

    return results;
  });
}

function startOfLocalDay(d) {
  const x = new Date(d);
  if (isNaN(x.getTime())) return null;
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function dayStartFromMessage(m) {
  for (const s of [m.rawDate, m.time]) {
    if (!s) continue;
    const t = startOfLocalDay(s);
    if (t != null) return t;
  }
  return null;
}

/** Chỉ giữ tin thuộc *ngày lịch* mới nhất trong tập (theo rawDate/time parse được). */
function filterMessagesLastCalendarDay(messages) {
  const dayStarts = messages.map((m) => dayStartFromMessage(m)).filter((t) => t != null);
  if (!dayStarts.length) return messages;

  const lastDayStart = Math.max(...dayStarts);
  return messages.filter((m) => {
    const ds = dayStartFromMessage(m);
    return ds != null && ds === lastDayStart;
  });
}

/** Đưa runway + vài parent có overflow về đầu (đủ cho Teams, không cuộn quá sâu). */
async function scrollChatPaneTowardStart(page) {
  await page.evaluate(() => {
    const base =
      document.querySelector("#chat-pane-list") ||
      document.querySelector('[data-tid="message-pane-list-runway"]') ||
      document.querySelector('[data-tid="messageThread"]');
    if (!base) return;
    let n = base;
    for (let i = 0; i < 4 && n; i++) {
      if (n.scrollHeight > n.clientHeight + 2) n.scrollTop = 0;
      n = n.parentElement;
    }
    base.scrollTop = 0;
  });
}

/**
 * Gom tin rồi lọc *một ngày lịch cuối cùng*.
 * Cuộn lên tối đa MAX_CHAT_SCROLL_UP lần (mở chat thường đã ở cuối thread).
 */
async function scrollThreadAndCollectLastDayMessages(page) {
  await waitForMessagePane(page);

  const seen = new Set();
  const merged = [];

  const mergeBatch = async () => {
    const batch = await extractMessagesFromDom(page);
    for (const m of batch) {
      const key = `${m.author}\0${m.rawDate}\0${m.text}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(m);
      }
    }
  };

  await mergeBatch();

  for (let pass = 0; pass < MAX_CHAT_SCROLL_UP; pass++) {
    await scrollChatPaneTowardStart(page);
    await page.waitForTimeout(550);
    await mergeBatch();
  }

  return filterMessagesLastCalendarDay(merged);
}

module.exports = { run };

if (require.main === module) {
  run().catch(console.error);
}
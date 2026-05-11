const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const { chromium } = require("playwright");
const fs = require("fs");

const PROFILE_DIR = "./teams-profile";
const MS_TEAM_GROUP_NAME =
  process.env.MS_TEAM_GROUP_NAME || "Mini Insignary Internal";
const ADDITIONAL_MS_TEAM_GROUP_NAME =
  process.env.ADDITIONAL_MS_TEAM_GROUP_NAME || null;
const TIMEOUT = 30_000; // ⏱️ 30s for each click/list action
const SHELL_TIMEOUT = 120_000; // Teams SPA loads slowly / many network connections
/** Maximum number of scroll ups to lazy-load more messages for the same day (enough for ~1 day of chat). */
const MAX_CHAT_SCROLL_UP = parseInt(process.env.MAX_CHAT_SCROLL_UP, 10) || 10;

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Chat button on the rail (Teams work + personal, UI changes data-tid depending on version). */
function chatNavLocator(page) {
  return page
    .locator('[data-tid="app-bar-chat"]')
    .or(page.locator('[data-tid="app-bar-item-chat"]'))
    .or(page.getByRole("button", { name: /^Chat$/i }))
    .or(page.getByRole("tab", { name: /^Chat$/i }))
    .or(page.locator('[aria-label="Chat"][role="button"]'))
    .or(page.locator('button[aria-label="Chat"]'));
}

/** Sidebar + app are ready (after login / reload). */
async function waitForTeamsShell(page) {
  await chatNavLocator(page).first().waitFor({
    state: "visible",
    timeout: SHELL_TIMEOUT,
  });
}

/**
 * Work/School vs Personal selection screen: do not click (DOM changes often)
 * — send Enter key to select Microsoft's default focused element.
 */
async function choosePersonalMicrosoftAccountIfShown(page, waitMs = 18_000) {
  const emailInput = page.locator('input#i0116, input[name="loginfmt"]');
  const pickerHint = page.getByText(
    /Work or school account|Personal Microsoft account|Tài khoản cơ quan|Tài khoản Microsoft cá nhân/i,
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
 * Tenant selection menu (Fluent): automatically click Personal if found
 * `role="menuitem"` containing `[data-tid="personal-tenant"]`.
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
      console.log("✅ Selected Personal tenant (Fluent menu).");
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
    viewport: { width: 1240, height: 800 },
    args: ["--no-sandbox"],
  });

  const page = context.pages()[0] || (await context.newPage());

  // Set default timeout to 2 minutes for all actions
  page.setDefaultTimeout(TIMEOUT);
  page.setDefaultNavigationTimeout(TIMEOUT);

  console.log("🚀 Opening Teams...");
  // Teams keeps WebSocket → networkidle is unreliable; wait for DOM then Chat rail.
  await page.goto("https://teams.microsoft.com", {
    waitUntil: "domcontentloaded",
    timeout: TIMEOUT,
  });
  await page.waitForTimeout(6000);

  // Fluent tenant list (Personal / Work) — click Personal if visible.
  let pickedPersonalTenant = await clickPersonalTenantMenuIfShown(page);
  // login.microsoftonline.com Work/School vs Personal — press Enter if shown.
  await choosePersonalMicrosoftAccountIfShown(page);
  if (!pickedPersonalTenant) {
    pickedPersonalTenant = await clickPersonalTenantMenuIfShown(page, 12_000);
  }

  // Check if login is required
  const needLogin = await page
    .locator('input[type="email"], [data-tid="signin-button"]')
    .isVisible()
    .catch(() => false);

  if (needLogin) {
    console.log("⚠️  First-time login required in browser...");
    console.log("👉 After logging in, press Enter here to continue.");
    // No timeout - wait for Enter press as long as needed
    await new Promise((r) => process.stdin.once("data", r));
    console.log("✅ Session saved! From next time, login will be automatic.");
  } else {
    console.log("✅ Already logged in, no need to login again!");
  }

  try {
    await waitForTeamsShell(page);
  } catch (e) {
    console.error(
      "❌ Chat button not found (Teams shell). Current URL:",
      page.url(),
    );
    await page
      .screenshot({
        path: path.join(__dirname, "../../app-data/teams-shell-timeout.png"),
        fullPage: true,
      })
      .catch(() => {});
    throw e;
  }

  // --- Chat → open correct group by name ---
  await openGroupChat(page, MS_TEAM_GROUP_NAME);
  await page.waitForTimeout(2000);

  // --- Scroll thread to load history, collect messages and keep only the latest day ---
  const result = await scrollThreadAndCollectLastDayMessages(page);
  let messages = result.messages;
  const referenceLatestDate = result.latestDate;

  if (ADDITIONAL_MS_TEAM_GROUP_NAME) {
    // --- Chat → open additional correct group by name ---
    await openGroupChat(page, ADDITIONAL_MS_TEAM_GROUP_NAME);
    await page.waitForTimeout(2000);

    // --- Scroll thread to load history, collect messages ---
    const additionalResult = await scrollThreadAndCollectLastDayMessages(page);
    // Filter additional group messages to match the reference group's latest date
    const filteredAdditional = filterMessagesByDate(
      additionalResult.messages,
      referenceLatestDate,
    );
    messages = messages.concat(filteredAdditional);
  }

  // Print to terminal
  console.log(`\n✅ ${messages.length} messages from the last day:\n`);
  messages.forEach((m) => {
    console.log(`👤 ${m.author}  🕐 ${m.time}`);
    console.log(`   ${m.text.replace(/\n/g, "\n   ")}`);
    console.log("─".repeat(60));
  });

  // Save files
  fs.writeFileSync(
    path.join(__dirname, "../../app-data/messages.json"),
    JSON.stringify(messages, null, 2),
  );
  fs.writeFileSync(
    path.join(__dirname, "../../app-data/messages.txt"),
    messages
      .map((m) => `[${m.time}] ${m.author}:\n${m.text}`)
      .join("\n\n---\n\n"),
  );
  console.log("\n📁 Saved app-data/messages.json + app-data/messages.txt");

  await context.close();
}

/** Click Chat on app bar then select conversation/group matching name. */
async function openGroupChat(page, name) {
  await chatNavLocator(page).first().click({ timeout: TIMEOUT });
  await page.waitForTimeout(1200);

  const re = new RegExp(escapeRegex(name), "i");
  const byListItem = page
    .locator('[data-tid="chat-list-item"]')
    .filter({ hasText: re });
  const byTree = page.getByRole("treeitem", { name: re });

  const groupItem = byListItem.first().or(byTree.first());
  await groupItem.waitFor({ state: "visible", timeout: TIMEOUT });
  await groupItem.scrollIntoViewIfNeeded();
  await groupItem.click({ timeout: TIMEOUT });
}

/** Message list (Fluent UI / new Teams): scroll runway + each bubble `chat-pane-message`. */
function messageListLocator(page) {
  return page
    .locator("#chat-pane-list, [data-tid='message-pane-list-runway']")
    .first();
}

async function waitForMessagePane(page) {
  try {
    await messageListLocator(page).waitFor({
      state: "visible",
      timeout: 25_000,
    });
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

/** Read all messages currently in DOM (no date filtering). Supports Fluent + legacy messageThread. */
async function extractMessagesFromDom(page) {
  return page.evaluate(() => {
    const results = [];

    /** Prefer `<time datetime>`, then `title` (Teams often attaches full ISO here). */
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
        clone
          .querySelectorAll?.('[data-tid="message-author-name"]')
          .forEach((n) => n.remove());
        clone.querySelectorAll?.("time").forEach((n) => n.remove());
        const t = clone.innerText?.replace(/\s+\n/g, "\n").trim();
        return t || "";
      };

      const leafBubblesIn = (root) =>
        Array.from(
          root.querySelectorAll('[data-tid="chat-pane-message"]'),
        ).filter((el) => !el.querySelector('[data-tid="chat-pane-message"]'));

      const covered = new Set();

      // For each chat row: meeting card + rich text usually attached to one `message-wrapper`.
      fluentRoot
        .querySelectorAll('[data-testid="message-wrapper"]')
        .forEach((wrap) => {
          if (!fluentRoot.contains(wrap)) return;
          const author = wrap
            .querySelector('[data-tid="message-author-name"]')
            ?.innerText?.trim();
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
          clone
            .querySelectorAll('[data-tid="message-author-name"]')
            .forEach((n) => n.remove());
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

      // Bubble not in wrapper (rare) — still include.
      leafBubblesIn(fluentRoot).forEach((msgEl) => {
        if (covered.has(msgEl)) return;
        const wrap = msgEl.closest('[data-testid="message-wrapper"]');
        const author =
          wrap
            ?.querySelector('[data-tid="message-author-name"]')
            ?.innerText?.trim() || "";
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
        .querySelector(
          '[data-tid="message-author-name"], [class*="authorName"]',
        )
        ?.innerText?.trim();
      const timeEl = el.querySelector("time");
      const body = el.querySelector(
        '[data-tid="message-body-content"], [class*="messageBody"]',
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

/** Keep only messages from the *latest calendar day* in the set (based on rawDate/time parse). */
function filterMessagesLastCalendarDay(messages) {
  const dayStarts = messages
    .map((m) => dayStartFromMessage(m))
    .filter((t) => t != null);
  if (!dayStarts.length) return messages;

  const lastDayStart = Math.max(...dayStarts);
  return messages.filter((m) => {
    const ds = dayStartFromMessage(m);
    return ds != null && ds === lastDayStart;
  });
}

/** Move runway + a few parents with overflow to top (enough for Teams, no deep scroll). */
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
 * Collect messages then filter *latest calendar day*.
 * Scroll up at most MAX_CHAT_SCROLL_UP times (chat usually already at bottom of thread).
 * @returns {{ messages: Array, latestDate: number|null }} Object with filtered messages and the latest date timestamp
 */
async function scrollThreadAndCollectLastDayMessages(page) {
  await waitForMessagePane(page);
  await page.keyboard.press("End");
  await page.waitForTimeout(2000);

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

  // Scroll to top first to ensure the first message is fully rendered in DOM
  await scrollChatPaneTowardStart(page);
  await page.waitForTimeout(550);

  await mergeBatch();

  for (let pass = 0; pass < MAX_CHAT_SCROLL_UP; pass++) {
    await scrollChatPaneTowardStart(page);
    await page.waitForTimeout(550);
    await mergeBatch();
  }

  const messages = filterMessagesLastCalendarDay(merged);

  // Get the latest date timestamp from filtered messages
  const dayStarts = messages
    .map((m) => dayStartFromMessage(m))
    .filter((t) => t != null);
  const latestDate = dayStarts.length > 0 ? Math.max(...dayStarts) : null;

  return { messages, latestDate };
}

/**
 * Filter messages to only include those from a specific date (by day start timestamp).
 * @param {Array} messages - Array of message objects
 * @param {number} targetDayStart - The day start timestamp to filter by
 * @returns {Array} Filtered messages
 */
function filterMessagesByDate(messages, targetDayStart) {
  if (targetDayStart == null) return messages;
  return messages.filter((m) => {
    const ds = dayStartFromMessage(m);
    return ds != null && ds === targetDayStart;
  });
}

module.exports = { run };

if (require.main === module) {
  run().catch(console.error);
}

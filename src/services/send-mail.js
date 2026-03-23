/**
 * send-mail.js
 * Send email via Zimbra Classic Webmail using Playwright.
 * - First time: Manual login required, session will be saved.
 * - Subsequent times: Automatically uses saved session, no re-login needed.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const fs = require("fs");
const { chromium } = require("playwright");

// ─────────────────────────────────────────────
//  CONFIGURATION
// ─────────────────────────────────────────────
const CONFIG = {
    zimbraUrl: process.env.ZIMBRA_URL || "https://webmail.tma.com.vn",
    fromName: process.env.FROM_NAME || "Khiem Nguyen Thanh",
    sessionDir: path.resolve(__dirname, "../../.zimbra-session"), // store cookies/session
};

const TO_RECIPIENTS = process.env.TO_RECIPIENTS || "";
if (TO_RECIPIENTS === "") {
    console.error("❌ TO_RECIPIENTS not configured in .env");
    console.error(
        `   Example: "Thanh Ho Ngoc" <hnthanh@tma.com.vn>; "Nguyen Tran Hoan Anh" <thanguyen@tma.com.vn>`,
    );
    process.exit(1);
}

const CC_RECIPIENTS = process.env.CC_RECIPIENTS || "";

function getCurrentWeekAndSprint(inputDate = new Date()) {
    const startDateStr = process.env.PROJECT_START_DATE;
    const weeksPerSprint =
        parseInt(process.env.NUMBER_OF_WEEKS_PER_SPRINT, 10) || 2;
    const startSprint = parseInt(process.env.START_SPRINT, 10) || 0;
    const startWeek = parseInt(process.env.START_WEEK, 10) || 1;

    if (!startDateStr) {
        throw new Error("PROJECT_START_DATE is not defined in .env");
    }

    const startDate = new Date(startDateStr);
    const currentDate = new Date(inputDate);

    if (isNaN(startDate.getTime())) {
        throw new Error("Invalid PROJECT_START_DATE format. Use yyyy/mm/dd");
    }

    // Normalize time
    startDate.setHours(0, 0, 0, 0);
    currentDate.setHours(0, 0, 0, 0);

    const diffMs = currentDate - startDate;

    if (diffMs < 0) {
        return { week: 0, sprint: 0 };
    }

    const week = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + startWeek;

    // 👉 Sprint starts from 0
    const sprint = Math.floor((week - startWeek) / weeksPerSprint) + startSprint;

    return { week, sprint };
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

async function fillComposeField(page, type, value) {
    let selector;

    switch (type) {
        case "to":
        case "cc":
        case "bcc":
            selector = `input[id$='_${type}_control']`;
            break;

        case "subject":
            selector = `input[id$='_subject_control']`;
            break;

        default:
            throw new Error(`Unsupported field type: ${type}`);
    }

    const field = page.locator(selector).first();

    if ((await field.count()) === 0) {
        throw new Error(`Could not find ${type.toUpperCase()} field`);
    }

    await field.waitFor({ state: "visible" });

    // 👉 Bubble fields (To/CC/BCC)
    if (["to", "cc", "bcc"].includes(type)) {
        await field.click({ force: true });
        await field.fill(""); // reset (optional)
        await field.type(value, { delay: 50 });
        await field.press("Tab"); // commit → create bubble
    }

    // 👉 Normal field (Subject)
    if (type === "subject") {
        await field.click();
        await field.fill(value);
    }

    console.log(`  ✍️  Filled ${type.toUpperCase()} field`);

    await page.waitForTimeout(300);
}

// ─────────────────────────────────────────────
//  COMPOSE AND SEND EMAIL (Zimbra Classic) — fallback
// ─────────────────────────────────────────────
async function composeAndSend(
    page,
    browser,
    recipients,
    cc_recipients,
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

    const r = getCurrentWeekAndSprint(date);

    const emailSubject = `[${process.env.COMPANY}][${process.env.CLIENT}] ${process.env.PROJECT} - Daily Report on ${date} - Week #${r.week}, Sprint #${r.sprint}`;

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

    await fillComposeField(page, "to", recipients);
    if (cc_recipients.trim()) {
        await fillComposeField(page, "cc", cc_recipients);
    }
    await fillComposeField(page, "subject", emailSubject);

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

    // Step 3: Close HTML tab
    await htmlPage.close();

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
            // Required for navigator.clipboard.write() to work in automated contexts
            "--enable-features=ClipboardAPI",
            "--enable-blink-features=ClipboardAPI",
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

        // Explicitly grant clipboard permissions for this origin.
        // The permissions passed at launchPersistentContext() are global defaults,
        // but some Chromium builds require a per-origin grant after navigation.
        await browser.grantPermissions(
            ["clipboard-read", "clipboard-write"],
            { origin: CONFIG.zimbraUrl },
        );

        // Check login status
        const loggedIn = await isLoggedIn(page);
        if (!loggedIn) {
            await waitForLogin(page);
        } else {
            console.log("✅ Using existing session — no login required.\n");
        }

        // Start sending email
        console.log(
            `\n📧 Starting to send to '${TO_RECIPIENTS}', and cc '${CC_RECIPIENTS}' ...\n`,
        );

        try {
            await composeAndSend(
                page,
                browser,
                TO_RECIPIENTS,
                CC_RECIPIENTS,
                date,
                resolvedFilePath,
            );
            console.log(`  ✅ Email sent successfully!\n`);
        } catch (err) {
            console.error(`  ❌ Failed to send email: ${err.message}\n`);
            await page.screenshot({ path: path.join(__dirname, "../../app-data/error-screenshot.png") });
            console.log("  📸 Screenshot saved: error-screenshot.png");
        }
    } finally {
        await browser.close();
    }
}

module.exports = { run };

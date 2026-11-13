/**
 * Pipeline:
 *  1. Scrape today's messages from MS Teams  (ms-team.js)
 *  2. Extract the last date from app-data/messages.json
 *  3. Sanitize the message log
 *  4. Build data prompt (JSON-request, no CSS/HTML embedding)
 *  5. Generate structured report JSON via selected AI engine (claude/gemini/cohere)
 *  6. Render final branded HTML locally and validate before sending
 */
require("./src/utils/env-loader").loadEnv();
const path = require("path");
const fs = require("fs");

// ── Main pipeline ─────────────────────────────────────────────────────────

async function main(notifyOnly = false) {
  if (notifyOnly) {
    console.log(
      "🚀 Running in notify-only mode. Only sending reminder to MS Teams.",
    );
    const { sendReminder } = require("./src/services/ms-team");
    await sendReminder();
    return;
  }

  const { run: runTeams } = require("./src/services/ms-team");
  await runTeams();

  const {
    extractLastDateFromMessages,
    getReportTitle,
  } = require("./src/utils/index");
  const reportDate = extractLastDateFromMessages(
    path.join(__dirname, "app-data/messages.json"),
  );
  const reportFilename = path.join(
    __dirname,
    `app-data/report_${reportDate.replace(/\//g, "-")}.html`,
  );
  const emailSubject = getReportTitle(reportDate);
  console.log("📧 Email subject:", emailSubject);

  const dailyReportText = fs.readFileSync(
    path.join(__dirname, "app-data/messages.txt"),
    "utf-8",
  );
  if (!dailyReportText.trim()) {
    console.info("No message log on MS Team found. Exit!");
    process.exit(1);
  }

  const { sanitizeText, writeReport } = require("./src/utils/sanitize");
  const { sanitizedText, report } = sanitizeText(dailyReportText);
  writeReport(report);

  const { buildPrompt } = require("./src/templates/prompt-template");
  const prompt = buildPrompt(reportDate, sanitizedText);
  fs.writeFileSync(
    path.join(__dirname, "app-data/prompt_sent.txt"),
    prompt,
    "utf-8",
  );

  // Generate structured report JSON via the configured AI engine, then render
  // final branded HTML locally. On parse/validation failure, save raw response
  // for debugging and abort before sending.
  const { renderReportHtml } = require("./src/templates/render-report");
  let reportData;

  try {
    if (process.env.AI_ENGINE === "GEMINI") {
      const { generateReportData } = require("./src/services/gemini");
      reportData = await generateReportData(prompt);
    } else if (process.env.AI_ENGINE === "CLAUDE") {
      const { generateReportData } = require("./src/services/claude");
      reportData = await generateReportData(prompt);
    } else if (process.env.AI_ENGINE === "COHERE") {
      const { generateReportData } = require("./src/services/cohere");
      reportData = await generateReportData(prompt);
    } else {
      console.error("No AI engine configurated. Abort");
      process.exit(1);
    }
  } catch (error) {
    const engine = process.env.AI_ENGINE || "UNKNOWN";
    const raw =
      error?.rawResponse ??
      error?.rawJsonText ??
      error?.response?.data ??
      error?.cause?.rawResponse ??
      "";
    if (raw) {
      const debugPath = path.join(
        __dirname,
        `app-data/llm_raw_response_${String(engine).toLowerCase()}.txt`,
      );
      try {
        const payload =
          typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
        fs.writeFileSync(debugPath, payload, "utf-8");
        console.error(`   Raw response saved to: ${debugPath}`);
      } catch (_) {}
    }
    const snippet =
      typeof raw === "string" ? raw.slice(0, 500) : JSON.stringify(raw).slice(0, 500);
    if (snippet) console.error(`   Raw response snippet: ${snippet}`);
    throw new Error(
      `Failed to obtain/parse report JSON from ${engine}: ${error?.message || error}`,
    );
  }

  const html = renderReportHtml(reportData, {
    emailSubject,
    reportTitle: process.env.PROJECT || emailSubject,
    company: process.env.COMPANY,
    client: process.env.CLIENT,
    author: process.env.FROM_NAME,
    reportDate,
  });
  fs.mkdirSync(path.dirname(reportFilename), { recursive: true });
  fs.writeFileSync(reportFilename, html, "utf-8");

  // Read the generated report file and verify it is valid HTML content.
  const reportContent = fs.readFileSync(reportFilename, "utf-8").trim();
  const htmlStart = reportContent.slice(0, 200);
  const isHtml =
    /^<!DOCTYPE\s+html/i.test(reportContent) ||
    /^<html[\s>]/i.test(reportContent) ||
    /<html[\s>]/i.test(reportContent);
  if (!isHtml) {
    console.error("❌ Generated report is not valid HTML content.");
    console.error(`   File: ${reportFilename}`);
    console.error(`   First 200 chars: ${htmlStart}`);
    process.exit(1);
  }
  console.log(`✅ Report validated as HTML: ${reportFilename}`);

  const { run } = require("./src/services/send-mail");
  await run(emailSubject, reportFilename);
}

const notifyOnly = process.argv.includes("--notify");

main(notifyOnly).catch((error) => {
  // Services already log a concise reason; never dump the full request/response.
  console.error(`❌ Pipeline failed: ${error?.message || error}`);
  if (error?.cause) console.error(`   Cause: ${error.cause.message || error.cause}`);
  process.exit(1);
});

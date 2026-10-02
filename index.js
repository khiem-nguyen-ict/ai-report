/**
 * Pipeline:
 *  1. Scrape today's messages from MS Teams  (ms-team.js)
 *  2. Extract the last date from app-data/messages.json
 *  3. Build prompt — fixed TMA Solutions branding + dynamic categories
 *  4. Send to Claude, wait for generation, download the HTML artifact  (claude.js)
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

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
  // Email subject is not used in LLM implementation but kept for API compatibility
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
  const prompt = buildPrompt(reportDate, sanitizedText, emailSubject);
  fs.writeFileSync(
    path.join(__dirname, "app-data/prompt_sent.txt"),
    prompt,
    "utf-8",
  );

  // Generate the report via the configured AI engine (Gemini, Claude or Cohere).
  // After generation, the file at reportFilename must contain valid HTML.
  // If the AI returns plain text or an error page instead, the pipeline
  // exits here with an error message (see validation block below).

  if (process.env.AI_ENGINE === "GEMINI") {
    const { sendToGeminiAndDownload } = require("./src/services/gemini");
    await sendToGeminiAndDownload(prompt, reportFilename);
  } else if (process.env.AI_ENGINE === "CLAUDE") {
    const { sendToClaudeAndDownload } = require("./src/services/claude");
    await sendToClaudeAndDownload(prompt, reportFilename);
  } else if (process.env.AI_ENGINE === "COHERE") {
    const { sendToCohereAndSave } = require("./src/services/cohere");
    await sendToCohereAndSave(prompt, reportFilename);
  } else {
    console.error("No AI engine configurated. Abort");
    process.exit(1);
  }

  // Read the generated report file and verify it is valid HTML content.
  // If the AI returned plain text or an error page instead of HTML, exit.
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

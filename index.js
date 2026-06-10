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
  // Email subject is not used in Gemini implementation but kept for API compatibility
  console.log("📧 Email subject:", emailSubject);

  const dailyReportText = fs.readFileSync(
    path.join(__dirname, "app-data/messages.txt"),
    "utf-8",
  );
  if (!dailyReportText.trim()) {
    console.info("No message log on MS Team found. Exit!");
    process.exit(1);
  }

  const { buildPrompt } = require("./src/templates/insignary");
  const prompt = buildPrompt(reportDate, dailyReportText, emailSubject);
  fs.writeFileSync(
    path.join(__dirname, "app-data/prompt_sent.txt"),
    prompt,
    "utf-8",
  );

  if (process.env.AI_ENGINE === "GEMINI") {
    const { sendToGeminiAndDownload } = require("./src/services/gemini");
    await sendToGeminiAndDownload(prompt, reportFilename);
  } else if (process.env.AI_ENGINE === "CLAUDE") {
    const { sendToClaudeAndDownload } = require("./src/services/claude");
    await sendToClaudeAndDownload(prompt, reportFilename);
  } else {
    console.error("No AI engine configurated. Abort");
    process.exit(1);
  }

  const { run } = require("./src/services/send-mail");
  await run(emailSubject, reportFilename);
}

const notifyOnly = process.argv.includes("--notify");

main(notifyOnly).catch((error) => {
  console.error(error);
  process.exit(1);
});

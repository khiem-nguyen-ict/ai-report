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

async function main() {
  const { run: runTeams } = require("./src/services/ms-team");
  await runTeams();

  const { extractLastDateFromMessages } = require("./src/utils/index");
  const reportDate = extractLastDateFromMessages(path.join(__dirname, "app-data/messages.json"));

  const dailyReportText = fs.readFileSync(path.join(__dirname, "app-data/messages.txt"), "utf-8");
  if (!dailyReportText.trim()) {
    console.log("No message log on MS Team found. Exit!");
    process.exit(1);
  }

  const { buildPrompt } = require("./src/templates/insignary");
  const prompt = buildPrompt(reportDate, dailyReportText);
  fs.writeFileSync(path.join(__dirname, "app-data/prompt_sent.txt"), prompt, "utf-8");

  const { sendToClaudeAndDownload } = require("./src/services/claude");
  const reportFilename = path.join(__dirname, `app-data/report_${reportDate.replace(/\//g, "-")}.html`);
  await sendToClaudeAndDownload(prompt, reportFilename);

  const { run } = require("./src/services/send-mail");
  await run(reportDate, reportFilename);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

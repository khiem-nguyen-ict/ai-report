/**
 * Pipeline:
 *  1. Scrape today's messages from MS Teams  (ms-team.js)
 *  2. Extract the last date from messages.json
 *  3. Build prompt — fixed TMA Solutions branding + dynamic categories
 *  4. Send to Claude, wait for generation, download the HTML artifact  (claude.js)
 */
require("dotenv").config();

async function main() {

  const { run } = require("./send-mail");

  const reportDate = "2026/03/23";
  const reportFilename = "report_2026-03-20.html";

  await run(reportDate, reportFilename);

}

main().catch(console.error);

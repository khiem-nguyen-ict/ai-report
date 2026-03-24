const path = require("path");

async function main() {
  const { run } = require("../services/send-mail");

  const reportDate = "2026/03/24";
  const reportFilename = path.join(__dirname, "../../app-data/report_2026-03-24.html");

  await run(reportDate, reportFilename);
}

main().catch(console.error);

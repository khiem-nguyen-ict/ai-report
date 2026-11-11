const path = require("path");
const fs = require("fs");

require("dotenv").config({ path: path.join(__dirname, ".env") });

(async () => {
  try {
    const reportDate = "2026-11-11";
    const dailyReportText = fs.readFileSync(
      path.join(__dirname, "app-data/messages.txt"),
      "utf-8",
    );
    const { sanitizeText } = require("./src/utils/sanitize");
    const { sanitizedText } = sanitizeText(dailyReportText);

    const { buildPrompt } = require("./src/templates/prompt-template");
    const prompt = buildPrompt(reportDate, sanitizedText);
    fs.writeFileSync(path.join(__dirname, "app-data/prompt_sent.txt"), prompt, "utf-8");

    console.log("🧠 Calling Cohere...");
    const { generateReportData } = require("./src/services/cohere");
    const reportData = await generateReportData(prompt);
    console.log("✅ Cohere returned parsed report JSON. Top-level keys:", Object.keys(reportData));

    const { renderReportHtml } = require("./src/templates/render-report");
    const emailSubject = "Test";
    const html = renderReportHtml(reportData, {
      emailSubject,
      reportTitle: process.env.PROJECT || emailSubject,
      company: process.env.COMPANY,
      author: process.env.FROM_NAME,
      reportDate,
    });
    fs.writeFileSync(path.join(__dirname, "app-data/report_TEST.html"), html, "utf-8");
    console.log("✅ Rendered HTML length:", html.length);

    const isHtml =
      /^<!DOCTYPE\s+html/i.test(html) ||
      /^<html[\s>]/i.test(html) ||
      /<html[\s>]/i.test(html);
    console.log(isHtml ? "✅ Valid HTML document" : "❌ NOT valid HTML");
  } catch (e) {
    console.error("❌ Cohere/render test failed:", e.message);
    if (e.cause) console.error("   cause:", e.cause.message || e.cause);
    process.exit(1);
  }
})();
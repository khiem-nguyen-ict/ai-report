/**
 * Test script for gemini.js service
 * Run with: node src/tests/test-gemini.js
 *
 * This is a LIVE integration test that drives a persistent browser profile
 * (manual login / CAPTCHA / 2FA may be required on first run). It is NOT
 * CI-safe by default — set RUN_GEMINI_INTEGRATION=1 to actually run it.
 *
 * The prompt requests the report JSON schema because generateReportData()
 * parses JSON (not HTML) via parseReportJson().
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const { generateReportData } = require("../services/gemini");

const testPrompt = [
  "Return a daily status report as a single JSON object with this exact schema:",
  '{',
  '  "overallStatus": "Green|Yellow|Orange|Red",',
  '  "summary": "one or two sentences about the day",',
  '  "issues": "None" or a short sentence,',
  '  "actions": ["next step 1", "next step 2"],',
  '  "taskGroups": [',
  '    { "category": "string", "items": [ { "description": "string", "status": "On-Going|Done", "expectedDate": "string or null" } ] }',
  '  ],',
  '  "humanResources": [ { "name": "string", "role": "string", "billable": true, "effort": 0 } ]',
  '}',
  "",
  "Daily log: Alice completed the data-pipeline refactor and is on-going. Bob reviewed docs.",
].join("\n");

function assertReportShape(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("generateReportData() did not return an object");
  }
  if (typeof data.overallStatus !== "string") {
    throw new Error("overallStatus missing or not a string");
  }
  if (!["Green", "Yellow", "Orange", "Red"].includes(data.overallStatus)) {
    throw new Error(`overallStatus "${data.overallStatus}" is not a valid status`);
  }
  if (typeof data.summary !== "string" || !data.summary.trim()) {
    throw new Error("summary missing or empty");
  }
  if (!Array.isArray(data.taskGroups)) {
    throw new Error("taskGroups is not an array");
  }
  if (!Array.isArray(data.humanResources)) {
    throw new Error("humanResources is not an array");
  }
}

function skip(message) {
  console.log(`⏭️  ${message}`);
  console.log("   (Set RUN_GEMINI_INTEGRATION=1 to run this live test.)");
}

async function main() {
  if (process.env.RUN_GEMINI_INTEGRATION !== "1") {
    skip("Gemini integration test skipped by default (browser-based, not CI-safe).");
    return;
  }

  console.log("🧪 Testing Gemini service...");
  console.log("📝 Prompt:", testPrompt);

  try {
    const data = await generateReportData(testPrompt);
    console.log(`   received keys: ${Object.keys(data).join(", ")}`);
    assertReportShape(data);
    console.log(`✅ Gemini test passed! (overallStatus=${data.overallStatus})`);
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    if (error?.rawResponse) console.error("   Raw response:", error.rawResponse);
    process.exit(1);
  }
}

main();
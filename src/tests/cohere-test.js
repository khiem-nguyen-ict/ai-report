/**
 * Test script for cohere.js service
 * Run with: node src/tests/cohere-test.js
 *
 * NOTE: This is a live integration test. It requires a valid COHERE_API_KEY
 * in .env and makes real API calls. It asserts the new JSON-report contract:
 * generateReportData() returns a parsed object matching the report schema.
 */
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const { generateReportData } = require("../services/cohere");

const outputPath = path.join(__dirname, "../../app-data/cohere_test_report.json");

// Prompt must ask for the report JSON schema (the service parses JSON, not HTML).
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
  if (typeof data.issues !== "string" || !data.issues.trim()) {
    throw new Error("issues missing or empty");
  }
  if (!Array.isArray(data.actions)) {
    throw new Error("actions is not an array");
  }
  if (!Array.isArray(data.taskGroups)) {
    throw new Error("taskGroups is not an array");
  }
  for (const g of data.taskGroups) {
    if (!g || typeof g.category !== "string" || !Array.isArray(g.items)) {
      throw new Error("taskGroups entry has invalid shape");
    }
  }
  if (!Array.isArray(data.humanResources)) {
    throw new Error("humanResources is not an array");
  }
  for (const p of data.humanResources) {
    if (!p || typeof p.name !== "string" || !p.name.trim()) {
      throw new Error("humanResources entry missing name");
    }
    if (typeof p.effort !== "number" || p.effort < 0 || p.effort > 100) {
      throw new Error(`effort for "${p.name}" is not a number in 0-100`);
    }
  }
}

async function testGenerateReportData() {
  console.log("🧪 Testing generateReportData()...");
  const data = await generateReportData(testPrompt);
  console.log(`   received keys: ${Object.keys(data).join(", ")}`);
  assertReportShape(data);
  console.log(`✅ generateReportData() OK (overallStatus=${data.overallStatus})`);
  return data;
}

async function testInvalidInput() {
  console.log("🧪 Testing input validation...");
  let threw = false;
  try {
    await generateReportData("   ");
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("Expected generateReportData('   ') to throw");
  console.log("✅ input validation OK");
}

async function testSaveReportJson(data) {
  console.log("🧪 Saving parsed report JSON for inspection...");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), "utf8");
  const content = fs.readFileSync(outputPath, "utf8");
  if (!content.trim()) throw new Error("Saved report JSON is empty");
  console.log(`✅ Report JSON saved to: ${outputPath} (${content.length} chars)`);
}

async function main() {
  if (!process.env.COHERE_API_KEY) {
    console.error(
      "❌ COHERE_API_KEY is not set. Add it to .env before running this test.",
    );
    process.exit(1);
  }

  console.log("📝 Prompt:", testPrompt);
  console.log("📁 Output path:", outputPath);

  const data = await testGenerateReportData();
  await testInvalidInput();
  await testSaveReportJson(data);

  console.log("\n🎉 All Cohere tests passed.");
}

main().catch((error) => {
  console.error("❌ Test failed:", error.message);
  if (error?.rawJsonText) console.error("   Raw JSON text:", error.rawJsonText);
  process.exit(1);
});
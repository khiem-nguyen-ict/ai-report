/**
 * Test script for cohere.js service
 * Run with: node src/tests/cohere-test.js
 */
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const { generateHtml, sendToCohereAndSave } = require("../services/cohere");

const outputPath = path.join(__dirname, "../../app-data/cohere_test_output.html");

const testPrompt = [
  "Create a simple weekly status report page.",
  "It must include a title, a short summary paragraph, and a 3-row table.",
  "Use inline CSS only, and keep the design clean and readable.",
].join(" ");

async function testGenerateHtml() {
  console.log("🧪 Testing generateHtml()...");
  const html = await generateHtml(testPrompt);
  console.log(`   length: ${html.length} chars`);
  console.log(`   starts with: ${html.slice(0, 60).replace(/\s+/g, " ")}`);

  if (!html.trim()) throw new Error("generateHtml() returned empty text");
  if (!/<html|<!doctype/i.test(html))
    throw new Error("Response does not look like an HTML document");
  console.log("✅ generateHtml() OK");
  return html;
}

async function testSaveToFile() {
  console.log("🧪 Testing sendToCohereAndSave()...");
  const absPath = await sendToCohereAndSave(testPrompt, outputPath);
  const content = fs.readFileSync(absPath, "utf8");
  if (!content.trim()) throw new Error("Saved file is empty");
  console.log(`✅ sendToCohereAndSave() OK (${content.length} chars)`);
  return absPath;
}

async function testInvalidInput() {
  console.log("🧪 Testing input validation...");
  let threw = false;
  try {
    await generateHtml("   ");
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("Expected generateHtml('   ') to throw");
  console.log("✅ input validation OK");
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

  await testGenerateHtml();
  await testInvalidInput();
  await testSaveToFile();

  console.log("\n🎉 All Cohere tests passed.");
}

main().catch((error) => {
  console.error("❌ Test failed:", error.message);
  process.exit(1);
});

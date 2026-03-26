/**
 * Test script for gemini.js service
 * Run with: node src/tests/test-gemini.js
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const { sendToGeminiAndDownload } = require("../services/gemini");

async function main() {
    const testPrompt = "Hello Gemini! Please respond with a simple message saying 'Test successful!'";
    const outputPath = path.join(__dirname, "../../app-data/gemini_test_output.txt");

    console.log("🧪 Testing Gemini service...");
    console.log("📝 Prompt:", testPrompt);
    console.log("📁 Output path:", outputPath);

    try {
        const result = await sendToGeminiAndDownload(testPrompt, outputPath);
        console.log("✅ Test completed! File saved to:", result);
        
        // Read and display the content
        const fs = require("fs");
        const content = fs.readFileSync(result, "utf8");
        console.log("\n📄 Response content:");
        console.log(content);
    } catch (error) {
        console.error("❌ Test failed:", error.message);
        process.exit(1);
    }
}

main();

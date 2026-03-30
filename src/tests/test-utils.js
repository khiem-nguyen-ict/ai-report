/**
 * Pipeline:
 *  1. Scrape today's messages from MS Teams  (ms-team.js)
 *  2. Extract the last date from app-data/messages.json
 *  3. Build prompt — fixed TMA Solutions branding + dynamic categories
 *  4. Send to Claude, wait for generation, download the HTML artifact  (claude.js)
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const fs = require("fs");

// ── Main pipeline ─────────────────────────────────────────────────────────

async function main() {
    
    const {
        getReportTitle,
    } = require("../utils/index");
     
    const emailSubject = getReportTitle(new Date());

    console.log("📧 Email subject:", emailSubject);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

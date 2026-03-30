const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

// Clean up stale browser lock files to avoid ProcessSingleton errors
function cleanupStaleBrowserFiles(dir) {
  const lockFiles = ["SingletonLock", "SingletonSocket", "SingletonCookie"];
  for (const file of lockFiles) {
    const filePath = path.join(dir, file);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️  Removed stale file: ${file}`);
      }
    } catch (err) {
      console.warn(`⚠️  Could not remove ${file}: ${err.message}`);
    }
  }
}

function extractLastDateFromMessages(
  messagesPath = path.join(__dirname, "../../app-data/messages.json"),
) {
  const messages = JSON.parse(fs.readFileSync(messagesPath, "utf-8"));
  let latest = null;
  for (const m of messages) {
    for (const s of [m.rawDate, m.time]) {
      if (!s) continue;
      const d = new Date(s);
      if (!isNaN(d.getTime()) && (!latest || d > latest)) latest = d;
    }
  }
  if (!latest) latest = new Date();
  const yyyy = latest.getFullYear();
  const mm = String(latest.getMonth() + 1).padStart(2, "0");
  const dd = String(latest.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

function getCurrentWeekAndSprint(inputDate = new Date()) {
  const startDateStr = process.env.PROJECT_START_DATE;
  console.log(
    "📅 Calculating week and sprint based on PROJECT_START_DATE:",
    startDateStr,
  );
  const weeksPerSprint =
    parseInt(process.env.NUMBER_OF_WEEKS_PER_SPRINT, 10) || 2;
  const startSprint = parseInt(process.env.START_SPRINT, 10) || 0;
  console.log(
    "⚙️  Configuration - weeksPerSprint:",
    weeksPerSprint,
    "startSprint:",
    startSprint,
  );
  const startWeek = parseInt(process.env.START_WEEK, 10) || 1;
  console.log("⚙️  Configuration - startWeek:", startWeek);

  if (!startDateStr) {
    throw new Error("PROJECT_START_DATE is not defined in .env");
  }

  const startDate = new Date(startDateStr);
  const currentDate = new Date(inputDate);
  console.log(
    "📅 Current date for calculation:",
    currentDate.toISOString().split("T")[0],
  );

  if (isNaN(startDate.getTime())) {
    throw new Error("Invalid PROJECT_START_DATE format. Use yyyy/mm/dd");
  }

  // Normalize to UTC midnight to avoid timezone issues
  const startUtc = Date.UTC(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate(),
  );
  const currentUtc = Date.UTC(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    currentDate.getDate(),
  );

  const diffMs = currentUtc - startUtc;

  if (diffMs < 0) {
    return { week: 0, sprint: 0 };
  }

  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const week = Math.floor(diffDays / 7) + startWeek;
  console.log("Number of days is ", diffDays);
  console.log("Number of weeks is ", Math.floor(diffDays / 7));
  console.log("Date diffs = ", diffMs, "ms");

  const sprint = Math.floor((week - startWeek) / weeksPerSprint) + startSprint;

  return { week, sprint };
}

function getReportTitle(date = new Date()) {
  const r = getCurrentWeekAndSprint(date);
  return `[${process.env.COMPANY}][${process.env.CLIENT}] ${process.env.PROJECT} - Daily Report on ${date} - Week #${r.week}, Sprint #${r.sprint}`;
}

module.exports = {
  cleanupStaleBrowserFiles,
  extractLastDateFromMessages,
  getCurrentWeekAndSprint,
  getReportTitle,
};

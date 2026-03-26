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
  const weeksPerSprint =
    parseInt(process.env.NUMBER_OF_WEEKS_PER_SPRINT, 10) || 2;
  const startSprint = parseInt(process.env.START_SPRINT, 10) || 0;
  const startWeek = parseInt(process.env.START_WEEK, 10) || 1;

  if (!startDateStr) {
    throw new Error("PROJECT_START_DATE is not defined in .env");
  }

  const startDate = new Date(startDateStr);
  const currentDate = new Date(inputDate);

  if (isNaN(startDate.getTime())) {
    throw new Error("Invalid PROJECT_START_DATE format. Use yyyy/mm/dd");
  }

  // Normalize time
  startDate.setHours(0, 0, 0, 0);
  currentDate.setHours(0, 0, 0, 0);

  const diffMs = currentDate - startDate;

  if (diffMs < 0) {
    return { week: 0, sprint: 0 };
  }

  const week = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + startWeek;
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

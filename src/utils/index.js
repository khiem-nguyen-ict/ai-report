const fs = require("fs");
const path = require("path");

function extractLastDateFromMessages(messagesPath = path.join(__dirname, "../../app-data/messages.json")) {
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

module.exports = { extractLastDateFromMessages };
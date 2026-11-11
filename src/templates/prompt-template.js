const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const company = process.env.COMPANY || "Company";
const author = process.env.FROM_NAME || "Khiem Nguyen";

// ── Human Resources config from .env ─────────────────────────────────────────
// Format: Name:Role:MaxEffort:Billable (fixed people, Billable = Yes or No)
const hrFixedPeople = (process.env.HR_FIXED_PEOPLE || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((entry) => {
    const parts = entry.split(":").map((s) => s.trim());
    const [name, role, maxEffort, billable] = parts;
    const effort = Math.max(1, Math.min(100, parseInt(maxEffort, 10) || 100));
    const isBillable = billable === "Yes";
    return { name, role, maxEffort: effort, billable: isBillable };
  });

// Format: Name:Role:MaxEffort (conditional people)
const hrConditionalPeople = (process.env.HR_CONDITIONAL_PEOPLE || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((entry) => {
    const [name, role, maxEffort] = entry.split(":").map((s) => s.trim());
    return { name, role, maxEffort: parseInt(maxEffort, 10) || 10 };
  });

function buildStep4Text() {
  let text = "STEP 4 — Human Resources. Return entries in `humanResources` with fields: name, role, billable (boolean), effort (0-100).\n";
  text += "- Fixed people (always included regardless of daily log):\n";
  for (const p of hrFixedPeople) {
    const billableLabel = p.billable ? "true" : "false";
    text += `    • ${p.name} — ${p.role}, billable = ${billableLabel}, Effort not more than ${p.maxEffort}%\n`;
  }
  text += "- Conditional people (only appear if found in the log):\n";
  for (const p of hrConditionalPeople) {
    text += `    • If "${p.name}" exists, Role is always "${p.role}" and Effort is not more than ${p.maxEffort}%\n`;
  }
  text += "- Flexible people (anyone found in the daily log but not listed above): include them. Assign a Role based on context (default: AI Developer). Effort is calculated from chat volume, proactiveness, and task complexity visible in the log. These people have billable = false.\n";
  text += "- Effort: calculated from chat volume, proactiveness, and task complexity visible in the log.\n";
  text += "- Do NOT include any Effort Rationale or explanation field.";
  return text;
}

function buildPrompt(_reportDate, dailyReportText) {
  const template = fs.readFileSync(path.join(__dirname, "prompt.txt"), "utf8");
  // Single-pass substitution with a function replacer: scraped chat text may
  // contain `$&`, `$1`, `$$` (prices, regex, shell snippets) which String.replace
  // would otherwise expand, and inserted text is never re-scanned for placeholders.
  const values = {
    COMPANY: company,
    AUTHOR: author,
    STEP4: buildStep4Text(),
    DAILY_REPORT: dailyReportText,
  };
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

module.exports = { buildPrompt };

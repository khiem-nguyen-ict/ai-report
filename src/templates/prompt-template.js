const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const COMPANY_BRAND_CSS = fs.readFileSync(path.join(__dirname, "brand.css"), "utf8");

const artifactTemplate = fs
  .readFileSync(path.join(__dirname, "artifact-template.html"), "utf8")
  .replace(/{{EMAIL_SUBJECT}}/g, "${emailSubject}")
  .replace(/{{REPORT_TITLE}}/g, "${reportTitle}")
  .replace(/{{COMPANY}}/g, "${company}")
  .replace(/{{AUTHOR}}/g, "${author}")
  .replace(/{{REPORT_DATE}}/g, "${reportDate}");

const company = process.env.COMPANY || "Company";
const project = process.env.PROJECT || "App Name";
const client = process.env.CLIENT || "Client Name";
const author = process.env.FROM_NAME || "Khiem Nguyen";

// ── Human Resources config from .env ─────────────────────────────────────────
// Format: Name:Role:MaxEffort (fixed people, always Billable = Yes)
const hrFixedPeople = (process.env.HR_FIXED_PEOPLE)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((entry) => {
    const parts = entry.split(":").map((s) => s.trim());
    const [name, role, maxEffort] = parts;
    const effort = Math.max(1, Math.min(100, parseInt(maxEffort, 10) || 100));
    return { name, role, maxEffort: effort };
  });

// Format: Name:Role:MaxEffort (conditional people)
const hrConditionalPeople = (process.env.HR_CONDITIONAL_PEOPLE)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((entry) => {
    const [name, role, maxEffort] = entry.split(":").map((s) => s.trim());
    return { name, role, maxEffort: parseInt(maxEffort, 10) || 10 };
  });

function buildStep4Text() {
  let text = "STEP 4 — Human Resources table. Columns: No., Name, Role, Billable, Effort (0-100%).\n";
  text += "- Fixed people at top (Billable = Yes):\n";
  for (const p of hrFixedPeople) {
    text += `    • ${p.name} — ${p.role}, Max Effort not more than ${p.maxEffort}%\n`;
  }
  text += "- All other people found in the log come after, Billable is No, and leave this column value empty.\n";
  for (const p of hrConditionalPeople) {
    text += `- If "${p.name}" is existed, his Role is always "${p.role}" and Effort is Not more than ${p.maxEffort}%\n`;
  }
  text += "- Effort: calculated from chat volume, proactiveness, and task complexity visible in the log.\n";
  text += "- Do NOT include any Effort Rationale or explanation column.";
  return text;
}

function buildPrompt(reportDate, dailyReportText, emailSubject) {
  let prompt = fs.readFileSync(path.join(__dirname, "prompt.txt"), "utf8");
  prompt = prompt.replace(/\{\{COMPANY\}\}/g, company);
  prompt = prompt.replace(/\{\{STEP4\}\}/g, buildStep4Text());
  prompt = prompt.replace(/\{\{CSS\}\}/g, COMPANY_BRAND_CSS);
  prompt = prompt.replace(/\{\{HTML_TEMPLATE\}\}/g, artifactTemplate);
  prompt = prompt.replace(/\{\{DAILY_REPORT\}\}/g, dailyReportText);
  return prompt;
}

module.exports = { buildPrompt };

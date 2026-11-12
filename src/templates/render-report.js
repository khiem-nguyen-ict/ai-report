const fs = require("fs");
const path = require("path");

const ARTIFACT_TEMPLATE_PATH = path.join(__dirname, "artifact-template.html");
const BRAND_CSS_PATH = path.join(__dirname, "brand.css");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeStatus(value) {
  const allowed = new Set(["Green", "Yellow", "Orange", "Red"]);
  const raw = String(value || "").trim();
  const normalized = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  return allowed.has(normalized) ? normalized : "Green";
}

function normalizeTaskStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "done" ? "Done" : "On-Going";
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampEffort(value) {
  const n = Math.round(toNumber(value, 0));
  return Math.max(0, Math.min(100, n));
}

function normalizeActions(actions) {
  if (Array.isArray(actions)) {
    return actions.map((a) => String(a ?? "").trim()).filter(Boolean);
  }
  if (typeof actions === "string" && actions.trim()) {
    return [actions.trim()];
  }
  return [];
}

function normalizeTaskGroups(taskGroups) {
  if (!Array.isArray(taskGroups)) return [];
  return taskGroups
    .map((group) => {
      const category = String(group?.category ?? "").trim();
      const rawItems = Array.isArray(group?.items) ? group.items : [];
      const items = rawItems
        .map((item) => ({
          description: String(item?.description ?? "").trim(),
          status: normalizeTaskStatus(item?.status),
          expectedDate:
            item?.expectedDate == null || String(item.expectedDate).trim() === ""
              ? null
              : String(item.expectedDate).trim(),
        }))
        .filter((item) => item.description);
      if (!category || items.length === 0) return null;
      return { category, items };
    })
    .filter(Boolean);
}

function normalizeHumanResources(humanResources) {
  if (!Array.isArray(humanResources)) return [];
  return humanResources
    .map((person) => {
      const name = String(person?.name ?? "").trim();
      if (!name) return null;
      const role = String(person?.role ?? "AI Developer").trim() || "AI Developer";
      const billable =
        person?.billable === true || String(person?.billable).toLowerCase() === "yes";
      const effort = clampEffort(person?.effort);
      return { name, role, billable, effort };
    })
    .filter(Boolean);
}

function normalizeReportData(data) {
  const input = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  const overallStatus = normalizeStatus(input.overallStatus);
  const summary = String(input.summary ?? "").trim() || "No summary provided.";
  const issuesRaw = String(input.issues ?? "").trim();
  const issues = issuesRaw || "None";
  const actions = normalizeActions(input.actions);
  const taskGroups = normalizeTaskGroups(input.taskGroups);
  const humanResources = normalizeHumanResources(input.humanResources);
  return { overallStatus, summary, issues, actions, taskGroups, humanResources };
}

function badgeClass(status) {
  switch (status) {
    case "Green":
      return "badge-green";
    case "Yellow":
      return "badge-yellow";
    case "Orange":
      return "badge-orange";
    case "Red":
      return "badge-red";
    default:
      return "badge-green";
  }
}

function renderTaskProgress(taskGroups) {
  if (!taskGroups.length) {
    return '<ol class="task-list"><li><div class="task-category">No tasks reported</div></li></ol>';
  }
  const parts = ['<ol class="task-list">'];
  for (const group of taskGroups) {
    parts.push("  <li>");
    parts.push(`    <div class="task-category">${escapeHtml(group.category)}</div>`);
    parts.push('    <ul class="sub-list">');
    for (const item of group.items) {
      const suffixParts = [`(${item.status})`];
      if (item.expectedDate) suffixParts.push(`Expected: ${item.expectedDate}`);
      parts.push(
        `      <li>${escapeHtml(item.description)} ${escapeHtml(suffixParts.join(". "))}</li>`
      );
    }
    parts.push("    </ul>");
    parts.push("  </li>");
  }
  parts.push("</ol>");
  return parts.join("\n");
}

function renderSummary(data) {
  const actions = data.actions.length ? data.actions : ["None"];
  const actionItems = actions.map((a) => `<li>${escapeHtml(a)}</li>`).join("\n");
  return [
    '<div class="status-row">',
    '  <span class="status-label">Overall Status:</span>',
    `  <span class="badge ${badgeClass(data.overallStatus)}">${escapeHtml(data.overallStatus)}</span>`,
    "</div>",
    `<div class="summary-row"><strong>Summary:</strong> ${escapeHtml(data.summary)}</div>`,
    `<div class="summary-row"><strong>Issues:</strong> ${escapeHtml(data.issues)}</div>`,
    '<div class="summary-row">',
    "  <strong>Actions:</strong>",
    '  <ul class="action-list">',
    actionItems,
    "  </ul>",
    "</div>",
  ].join("\n");
}

function renderHumanResources(humanResources) {
  if (!humanResources.length) {
    return '<tr><td colspan="5">No human resources reported</td></tr>';
  }
  return humanResources
    .map((person, idx) => {
      const billableClass = person.billable ? "billable-yes" : "billable-no";
      const billableText = person.billable ? "Yes" : "No";
      return [
        "<tr>",
        `  <td>${idx + 1}</td>`,
        `  <td>${escapeHtml(person.name)}</td>`,
        `  <td>${escapeHtml(person.role)}</td>`,
        `  <td><span class="${billableClass}">${billableText}</span></td>`,
        "  <td>",
        '    <div class="effort-bar">',
        `      <div class="bar-track"><div class="bar-fill" style="width:${person.effort}%"></div></div>`,
        `      <span class="bar-label">${person.effort}%</span>`,
        "    </div>",
        "  </td>",
        "</tr>",
      ].join("\n");
    })
    .join("\n");
}

function renderReportHtml(reportData, meta = {}) {
  const normalized = normalizeReportData(reportData);
  const css = fs.readFileSync(BRAND_CSS_PATH, "utf8");
  let html = fs.readFileSync(ARTIFACT_TEMPLATE_PATH, "utf8");

  const emailSubject = String(meta.emailSubject ?? "");
  const reportTitle = String(meta.reportTitle ?? meta.emailSubject ?? "");
  const company = String(meta.company ?? process.env.COMPANY ?? "Company");
  const client = String(meta.client ?? process.env.CLIENT ?? "").trim() || "-";
  const author = String(meta.author ?? process.env.FROM_NAME ?? "Khiem Nguyen");
  const reportDate = String(meta.reportDate ?? "");

  // Inject brand CSS first (function replacer: CSS may contain `$` sequences).
  html = html.replace(/<style>[\s\S]*?<\/style>/, () => `<style>\n${css}\n  </style>`);

  // Single-pass placeholder substitution. A function replacer avoids `$&`/`$1`/`$$`
  // expansion in inserted content, and one pass means inserted content is never
  // re-scanned for placeholders (no cross-injection between fields).
  const values = {
    EMAIL_SUBJECT: escapeHtml(emailSubject),
    REPORT_TITLE: escapeHtml(reportTitle),
    COMPANY: escapeHtml(company),
    CLIENT: escapeHtml(client),
    AUTHOR: escapeHtml(author),
    REPORT_DATE: escapeHtml(reportDate),
    TASK_PROGRESS: renderTaskProgress(normalized.taskGroups),
    SUMMARY_BLOCK: renderSummary(normalized),
    HR_ROWS: renderHumanResources(normalized.humanResources),
  };
  html = html.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match,
  );

  return html;
}

function extractJsonFromText(text) {
  if (typeof text !== "string") return "";
  let s = text.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) s = fence[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }
  return s.trim();
}

function parseReportJson(text) {
  const jsonText = extractJsonFromText(text);
  if (!jsonText) {
    throw new Error("LLM response did not contain a JSON object.");
  }
  try {
    return JSON.parse(jsonText);
  } catch (err) {
    const parseErr = new Error(`Invalid JSON from LLM: ${err.message}`);
    parseErr.rawJsonText = jsonText;
    throw parseErr;
  }
}

module.exports = {
  renderReportHtml,
  normalizeReportData,
  extractJsonFromText,
  parseReportJson,
  escapeHtml,
};

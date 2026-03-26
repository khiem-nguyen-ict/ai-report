const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const company = process.env.COMPANY || "TMA Solutions";
const project = process.env.PROJECT || "AI Code Scanner";
const client = process.env.CLIENT || "Insignary";
const author = process.env.FROM_NAME || "Khiem Nguyen";
const reportTitle = `${company} - ${project} / ${client}`;

// ── TMA Solutions brand design spec (fixed — never changes) ───────────────
const TMA_BRAND_CSS = `
  /* ── TMA Solutions brand tokens ── */
  :root {
    --company-branding-color:      #279DD8;
    --highlight-color:    #FFCC16;
    --tma-bg:        #EEF9FF;
    --tma-card:      #FFFFFF;
    --tma-text:      #1A1A2E;
    --tma-muted:     #555555;
    --tma-border:    #DDE3ED;
    --tma-row-alt:   #EEF2F8;
    --tma-font:      Arial, Helvetica, sans-serif;
  }

  /* ── Reset & base ── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--tma-font);
    font-size: 16px;
    color: var(--tma-text);
    background: var(--tma-bg);
    line-height: 1.6;
  }

  /* ── Header / banner ── */
  .report-header {
    background: var(--company-branding-color);
    color: #fff;
    padding: 24px 32px 20px;
    display: flex;
    align-items: center;
    gap: 20px;
    border-bottom: 4px solid var(--highlight-color);
  }
  .report-header .title-block h1 {
    font-size: 22px;
    font-weight: 700;
    margin-bottom: 2px;
  }
  .report-header .title-block p {
    font-size: 14px;
    opacity: 0.75;
    letter-spacing: 0.5px;
  }

  /* ── Layout wrapper ── */
  .report-body {
    max-width: 860px;
    margin: 28px auto;
    padding: 0 20px 40px;
  }

  /* ── Section card ── */
  .section {
    background: var(--tma-card);
    border: 1px solid var(--tma-border);
    border-radius: 6px;
    margin-bottom: 24px;
    overflow: hidden;
    box-shadow: 0 2px 6px rgba(27,55,100,.07);
  }
  .section-title {
    background: var(--company-branding-color);
    color: #fff;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    padding: 10px 18px;
    border-left: 4px solid var(--highlight-color);
  }
  .section-body { padding: 18px 20px; }

  /* ── Task list ── */
  .task-list { list-style: none; counter-reset: task-counter; }
  .task-list > li {
    counter-increment: task-counter;
    padding: 8px 0 8px 36px;
    border-bottom: 1px solid var(--tma-border);
    position: relative;
  }
  .task-list > li:last-child { border-bottom: none; }
  .task-list > li::before {
    content: counter(task-counter) ".";
    position: absolute;
    left: 8px;
    color: var(--company-branding-color);
    font-weight: 700;
    min-width: 24px;
  }
  .task-category {
    font-weight: 700;
    color: var(--company-branding-color);
    margin-bottom: 6px;
    font-size: 15.5px;
  }
  .sub-list { list-style: none; padding-left: 16px; margin-top: 4px; }
  .sub-list li {
        position: relative;
        padding: 6px 0 6px 22px;
        margin-bottom: 6px;
        font-size: 15px;
        color: var(--tma-text);
    }

    .sub-list li::before {
        content: "";
        position: absolute;
        left: 0;
        top: 14px;
        width: 8px;
        height: 8px;
        background-color: var(--highlight-color);
        border-radius: 50%;
    }

  /* ── Status badge ── */
  .status-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .status-label { font-weight: 700; color: var(--company-branding-color); min-width: 120px; }
  .badge {
    display: inline-block;
    padding: 3px 14px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: #fff;
  }
  .badge-green  { background: #006B3D; }
  .badge-yellow  { background: #FF980E; }
  .badge-orange { background: #FF681E; }
  .badge-red    { background: #D3212C; }

  /* ── Summary text rows ── */
  .summary-row { margin-bottom: 10px; }
  .summary-row strong { color: var(--company-branding-color); display: inline-block; min-width: 90px; }
  .action-list { padding-left: 20px; margin-top: 4px; }
  .action-list li { margin-bottom: 4px; font-size: 15px; }

  /* ── HR Table ── */
  .hr-table { width: 100%; border-collapse: collapse; font-size: 15px; }
  .hr-table thead tr {
    background: var(--company-branding-color);
    color: #fff;
  }
  .hr-table thead th {
    padding: 10px 14px;
    text-align: left;
    font-weight: 700;
    letter-spacing: 0.3px;
    border-right: 1px solid rgba(255,255,255,0.15);
  }
  .hr-table thead th:last-child { border-right: none; }
  .hr-table tbody tr:nth-child(even) { background: var(--tma-row-alt); }
  .hr-table tbody tr:hover { background: #dde7f5; }
  .hr-table td {
    padding: 9px 14px;
    border-bottom: 1px solid var(--tma-border);
    vertical-align: middle;
  }
  .billable-yes {
    color: #2E7D32;
    font-weight: 700;
    font-size: 14px;
    text-transform: uppercase;
  }
  .billable-no {
    color: var(--tma-muted);
    font-size: 14px;
    text-transform: uppercase;
  }
  .effort-bar {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .effort-bar .bar-track {
    flex: 1;
    background: var(--tma-border);
    border-radius: 4px;
    height: 8px;
    overflow: hidden;
    min-width: 60px;
  }
  .effort-bar .bar-fill {
    height: 100%;
    background: var(--highlight-color);
    border-radius: 4px;
  }
  .effort-bar .bar-label {
    font-size: 14px;
    font-weight: 700;
    color: var(--company-branding-color);
    min-width: 36px;
    text-align: right;
  }

  /* ── Footer ── */
  .report-footer {
    text-align: center;
    font-size: 13px;
    color: var(--tma-muted);
    padding: 16px;
    border-top: 2px solid var(--company-branding-color);
    margin-top: 8px;
  }
  .report-footer span { color: var(--company-branding-color); font-weight: 700; }
`.trim();

// ── Prompt builder ────────────────────────────────────────────────────────

function buildPrompt(reportDate, dailyReportText, emailSubject) {
  return `You are a professional Project Coordinator working for ${company}.

Below is the raw Daily Report log from a development team's chat.

---

YOUR TASKS:

STEP 1 — Derive 3 to 5 task categories dynamically from the log content.
Do NOT use a fixed list. Read the log, identify real categories of work (e.g. "Training Pipeline", "Dataset Preparation", "Code Quality", "Others").
Use short, concise category headers.

STEP 2 — Organize tasks under those categories:
- Single continuous numbered list (1, 2, 3…) across all categories — never restart.
- 4 spaces indentation for all sub-items.
- Mark each task as (On-Going) or (Done).
- Keep any Expectation Date mentioned.
- Remove all names / assignee mentions.
- Skip categories with no tasks.
- Ignore casual chat, only parse work content.
- English only.

STEP 3 — Short summary section:
1. Overall Status: Green / Yellow / Orange / Red. (Green = OK, Yellow = concern or warning, Orange = important warning, Red = critical). Use Yello/Red/Orange only for blockers impacting progress.
2. Summary: 1–2 sentences about the day.
3. Issues: "None" or 1–2 sentences.
4. Actions: Bullet points for next steps.

STEP 4 — Human Resources table. Columns: No., Name, Role, Billable, Effort (0–100%).
- Fixed people at top (Billable = Yes):
    • Khiem Nguyen — Project Manager, Effort: always 30%
    • Gioi Nguyen   — Technical Leader, Effort: max 50%
    • Toan Huynh    — AI Developer, Effort: always 0% (Avatar)
    • Long Le       — derive Role from log, Billable: Yes
- All other people found in the log come after, Billable is No, and leave this column value empty. If "Dung Dao" is existed, his Role is always "Advisor"
- Effort: calculated from chat volume, proactiveness, and task complexity visible in the log.
- Do NOT include any Effort Rationale or explanation column.

---

OUTPUT FORMAT — CRITICAL:
Create a Claude Artifact of type HTML.
The artifact must be a COMPLETE, SELF-CONTAINED HTML file.

BRANDING IS FIXED — do NOT change any colors, fonts, or layout structure from the spec below.
This design must be consistent across every single report generated. Never deviate.

Use EXACTLY this CSS (paste it verbatim inside a <style> tag):
\`\`\`
${TMA_BRAND_CSS}
\`\`\`

Use EXACTLY this HTML structure (fill in the [CONTENT] placeholders):

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${emailSubject}</title>
  <style>
    /* PASTE THE FULL CSS ABOVE HERE — DO NOT MODIFY */
  </style>
</head>
<body>

  <!-- HEADER -->
  <div class="report-header">
    <div class="title-block">
      <h1>${emailSubject}</h1>
      <p>${reportTitle}</p>
    </div>
  </div>

  <div class="report-body">

    <!-- SECTION 1: TASK LIST -->
    <div class="section">
      <div class="section-title">Task Progress</div>
      <div class="section-body">
        <ol class="task-list">
          <!-- For each category and its tasks: -->
          <li>
            <div class="task-category">[Category Name]</div>
            <ul class="sub-list">
              <li>[Sub-task description] ([On-Going / Done]). [Expected Date if any]</li>
            </ul>
          </li>
          <!-- ... continue for all tasks ... -->
        </ol>
      </div>
    </div>

    <!-- SECTION 2: SUMMARY -->
    <div class="section">
      <div class="section-title">Daily Summary</div>
      <div class="section-body">
        <div class="status-row">
          <span class="status-label">Overall Status:</span>
          <!-- Use badge-green, badge-yellow, badge-orange, or badge-red based on status -->
          <span class="badge badge-[green|yellow|orange|red]">[Green / Yellow / Orange / Red]</span>
        </div>
        <div class="summary-row"><strong>Summary:</strong> [1–2 sentence summary]</div>
        <div class="summary-row"><strong>Issues:</strong> [None or 1–2 sentences]</div>
        <div class="summary-row">
          <strong>Actions:</strong>
          <ul class="action-list">
            <li>[Action item]</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- SECTION 3: HR TABLE -->
    <div class="section">
      <div class="section-title">Human Resources</div>
        <table class="hr-table">
            <thead>
            <tr>
                <th style="border-left: 4px solid var(--highlight-color);">No.</th><th>Name</th><th>Role</th><th>Billable</th><th>Effort</th>
            </tr>
            </thead>
            <tbody>
            <!-- For each person: -->
            <tr>
                <td>[N]</td>
                <td>[Name]</td>
                <td>[Role]</td>
                <td><span class="billable-yes">Yes</span></td>
                <td>
                <div class="effort-bar">
                    <div class="bar-track"><div class="bar-fill" style="width:[X]%"></div></div>
                    <span class="bar-label">[X]%</span>
                </div>
                </td>
            </tr>
            </tbody>
        </table>
    </div>

  </div><!-- /.report-body -->

  <!-- FOOTER -->
  <div class="report-footer">
  <span>${company}</span> - Prepared by <strong>${author}</strong> - ${reportDate}
  <br/>
  <small>
  ${emailSubject}
  </small>
  <small style="color: var(--tma-muted);">
    Locally developed tool. No third-party automation services used. Secure and private by design.
  </small>
</div>

</body>
</html>
\`\`\`

Do NOT output anything outside the artifact.
The artifact must start exactly with <!DOCTYPE html>.

---

Here is the Daily Report Content:

${dailyReportText}`;
}

module.exports = { buildPrompt };

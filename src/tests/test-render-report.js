const assert = require("node:assert");
const {
  renderReportHtml,
  normalizeReportData,
  extractJsonFromText,
  parseReportJson,
  escapeHtml,
} = require("../templates/render-report");

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(err.message);
    process.exitCode = 1;
  }
}

const sample = {
  overallStatus: "Yellow",
  summary: "Sprint review prep.",
  issues: "GPU shortage",
  actions: ["Order more GPUs"],
  taskGroups: [
    {
      category: "Infra",
      items: [
        {
          description: "Set up CI",
          status: "On-Going",
          expectedDate: "2026-11-20",
        },
      ],
    },
  ],
  humanResources: [
    { name: "Alice", role: "Engineer", billable: true, effort: 80 },
  ],
};

const meta = {
  emailSubject: "Daily Report",
  reportTitle: "Project X",
  company: "Acme",
  author: "Khiem",
  reportDate: "2026-11-11",
};

// ── escapeHtml ──────────────────────────────────────────────────────────────
test("escapeHtml escapes & < > \" '", () => {
  assert.strictEqual(
    escapeHtml(`<a href="x">Tom & 'Jerry'</a>`),
    "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;",
  );
});

test("escapeHtml handles null/undefined", () => {
  assert.strictEqual(escapeHtml(null), "");
  assert.strictEqual(escapeHtml(undefined), "");
});

// ── extractJsonFromText / parseReportJson ───────────────────────────────────
test("extractJsonFromText strips ```json fences", () => {
  assert.strictEqual(extractJsonFromText('```json\n{"a":1}\n```'), '{"a":1}');
});

test("extractJsonFromText extracts object surrounded by prose", () => {
  assert.strictEqual(
    extractJsonFromText('Here you go: {"a":1} hope it helps'),
    '{"a":1}',
  );
});

test("extractJsonFromText returns empty string for non-string input", () => {
  assert.strictEqual(extractJsonFromText(null), "");
  assert.strictEqual(extractJsonFromText(42), "");
});

test("parseReportJson parses fenced JSON", () => {
  const parsed = parseReportJson("```json\n" + JSON.stringify(sample) + "\n```");
  assert.strictEqual(parsed.overallStatus, "Yellow");
});

test("parseReportJson throws when there is no JSON object", () => {
  assert.throws(() => parseReportJson("no json here"), /JSON/);
});

test("parseReportJson attaches rawJsonText on invalid JSON", () => {
  try {
    parseReportJson("{ not valid json }");
    assert.fail("expected parseReportJson to throw");
  } catch (err) {
    assert.ok(/Invalid JSON/.test(err.message));
    assert.strictEqual(err.rawJsonText, "{ not valid json }");
  }
});

// ── normalizeReportData ─────────────────────────────────────────────────────
test("normalizeReportData coerces effort string and clamps to 0-100", () => {
  const n = normalizeReportData({
    humanResources: [
      { name: "A", effort: "80" },
      { name: "B", effort: 250 },
      { name: "C", effort: -5 },
      { name: "D", effort: "abc" },
    ],
  });
  assert.deepStrictEqual(
    n.humanResources.map((p) => p.effort),
    [80, 100, 0, 0],
  );
});

test("normalizeReportData defaults unknown status to Green and normalizes case", () => {
  assert.strictEqual(normalizeReportData({ overallStatus: "purple" }).overallStatus, "Green");
  assert.strictEqual(normalizeReportData({ overallStatus: "RED" }).overallStatus, "Red");
});

test("normalizeReportData defaults empty summary/issues and wraps string actions", () => {
  const n = normalizeReportData({ summary: "", issues: "  ", actions: "Do X" });
  assert.strictEqual(n.summary, "No summary provided.");
  assert.strictEqual(n.issues, "None");
  assert.deepStrictEqual(n.actions, ["Do X"]);
});

test("normalizeReportData filters empty groups/items and normalizes task status", () => {
  const n = normalizeReportData({
    taskGroups: [
      { category: "", items: [{ description: "x" }] },
      { category: "Empty", items: [] },
      { category: "Blank item", items: [{ description: "  " }] },
      {
        category: "Ok",
        items: [
          { description: "t1", status: "done", expectedDate: "" },
          { description: "t2", status: "whatever", expectedDate: "soon" },
        ],
      },
    ],
  });
  assert.strictEqual(n.taskGroups.length, 1);
  assert.strictEqual(n.taskGroups[0].items[0].status, "Done");
  assert.strictEqual(n.taskGroups[0].items[0].expectedDate, null);
  assert.strictEqual(n.taskGroups[0].items[1].status, "On-Going");
  assert.strictEqual(n.taskGroups[0].items[1].expectedDate, "soon");
});

test("normalizeReportData defaults role and handles billable variants", () => {
  const n = normalizeReportData({
    humanResources: [
      { name: "A", billable: "Yes" },
      { name: "B", billable: false },
      { name: "", role: "ignored" },
    ],
  });
  assert.strictEqual(n.humanResources.length, 2);
  assert.strictEqual(n.humanResources[0].role, "AI Developer");
  assert.strictEqual(n.humanResources[0].billable, true);
  assert.strictEqual(n.humanResources[1].billable, false);
});

test("normalizeReportData tolerates non-object input", () => {
  for (const bad of [null, undefined, [], "str", 5]) {
    const n = normalizeReportData(bad);
    assert.strictEqual(n.overallStatus, "Green");
    assert.deepStrictEqual(n.taskGroups, []);
    assert.deepStrictEqual(n.humanResources, []);
  }
});

// ── renderReportHtml ────────────────────────────────────────────────────────
test("renderReportHtml produces a complete HTML doc with no leftover placeholders", () => {
  const html = renderReportHtml(sample, meta);
  assert.ok(/^<!DOCTYPE html/i.test(html.trim()));
  assert.ok(/<html[\s>]/i.test(html));
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(html), "leftover placeholder found");
});

test("renderReportHtml injects brand CSS and replaces the stub comment", () => {
  const html = renderReportHtml(sample, meta);
  assert.ok(html.includes("--company-branding-color"));
  assert.ok(!html.includes("PASTE THE FULL CSS"));
});

test("renderReportHtml renders badge, task, effort bar and footer", () => {
  const html = renderReportHtml(sample, meta);
  assert.ok(html.includes("badge-yellow"));
  assert.ok(html.includes("Set up CI (On-Going). Expected: 2026-11-20"));
  assert.ok(html.includes('style="width:80%"'));
  assert.ok(html.includes("billable-yes"));
  assert.ok(/Prepared by <strong>Khiem<\/strong>/.test(html));
  assert.ok(html.includes("2026-11-11"));
  assert.ok(html.includes("Acme"));
});

test("renderReportHtml escapes untrusted content (XSS)", () => {
  const evil = {
    ...sample,
    summary: "<script>alert(1)</script>",
    taskGroups: [
      {
        category: "<img src=x onerror=1>",
        items: [{ description: "<b>bold</b>", status: "Done" }],
      },
    ],
    humanResources: [{ name: "<i>Eve</i>", role: "r", billable: false, effort: 10 }],
  };
  const html = renderReportHtml(evil, { ...meta, emailSubject: "<x>" });
  assert.ok(!html.includes("<script>alert(1)"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("<i>Eve</i>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("billable-no"));
});

test("renderReportHtml renders fallbacks for empty data", () => {
  const html = renderReportHtml({}, meta);
  assert.ok(html.includes("No tasks reported"));
  assert.ok(html.includes("No human resources reported"));
  assert.ok(html.includes("<li>None</li>"));
  assert.ok(html.includes("badge-green"));
});

test("renderReportHtml does not mangle `$` sequences in content", () => {
  const data = {
    ...sample,
    summary: "Cost was $& and $1 and $$ total",
  };
  const html = renderReportHtml(data, meta);
  assert.ok(html.includes("Cost was $&amp; and $1 and $$ total"));
});

test("renderReportHtml does not re-expand placeholders found in content", () => {
  const data = {
    ...sample,
    summary: "literal {{HR_ROWS}} and {{TASK_PROGRESS}} text",
  };
  const html = renderReportHtml(data, meta);
  assert.ok(html.includes("literal {{HR_ROWS}} and {{TASK_PROGRESS}} text"));
  // HR table must still render exactly one Alice row
  assert.strictEqual(html.split("Alice").length - 1, 1);
});

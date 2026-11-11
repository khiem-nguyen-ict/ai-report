const assert = require("node:assert");

// prompt-template.js reads env at require time (and loads .env via dotenv,
// which never overrides already-set variables), so set these first.
process.env.COMPANY = "Acme";
process.env.FROM_NAME = "Test Author";
process.env.HR_FIXED_PEOPLE = "Alice:Lead:90:Yes,Bob:Dev:50:No";
process.env.HR_CONDITIONAL_PEOPLE = "Carol:Advisor:10";

const { buildPrompt } = require("../templates/prompt-template");

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

test("buildPrompt fills company, author and daily report", () => {
  const prompt = buildPrompt("2026/11/11", "LOG BODY HERE");
  assert.ok(prompt.includes("working for Acme"));
  assert.ok(prompt.includes("Report Author: Test Author."));
  assert.ok(prompt.includes("LOG BODY HERE"));
});

test("buildPrompt leaves no unresolved placeholders", () => {
  const prompt = buildPrompt("2026/11/11", "log");
  assert.ok(!/\{\{[A-Z0-9_]+\}\}/.test(prompt));
});

test("buildPrompt requests JSON and does not embed CSS/HTML templates", () => {
  const prompt = buildPrompt("2026/11/11", "log");
  assert.ok(prompt.includes('"taskGroups"'));
  assert.ok(prompt.includes('"humanResources"'));
  assert.ok(!prompt.includes("<!DOCTYPE html"));
  assert.ok(!prompt.includes("--company-branding-color"));
});

test("buildPrompt renders fixed and conditional HR people from env", () => {
  const prompt = buildPrompt("2026/11/11", "log");
  assert.ok(prompt.includes("Alice — Lead, billable = true, Effort not more than 90%"));
  assert.ok(prompt.includes("Bob — Dev, billable = false, Effort not more than 50%"));
  assert.ok(prompt.includes('If "Carol" exists, Role is always "Advisor"'));
});

test("buildPrompt does not expand `$` sequences from the chat log", () => {
  const log = "Paid $& for $1 and $$ plus $` and $'";
  const prompt = buildPrompt("2026/11/11", log);
  assert.ok(prompt.includes(log), "log text was altered by String.replace expansion");
});

test("buildPrompt does not re-expand placeholders found in the chat log", () => {
  const log = "user typed {{COMPANY}} and {{STEP4}} literally";
  const prompt = buildPrompt("2026/11/11", log);
  assert.ok(prompt.includes(log));
});

const assert = require("node:assert");
const crypto = require("node:crypto");
const {
  sanitizeText,
  isHighEntropy,
  shannonEntropy,
} = require("../utils/sanitize");

// Reset env between tests to avoid cross-contamination
function resetEnv() {
  delete process.env.SENSITIVE_KEYWORDS;
  delete process.env.SANITIZATION_ALLOWLIST;
  delete process.env.SANITIZATION_MODE;
}

function test(name, fn) {
  resetEnv();
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(err.message);
    process.exitCode = 1;
  }
}

// ── Entropy helpers ─────────────────────────────────────────────────────────
test("shannonEntropy returns 0 for empty string", () => {
  assert.strictEqual(shannonEntropy(""), 0);
});

test("shannonEntropy returns 0 for uniform string", () => {
  assert.strictEqual(shannonEntropy("aaaa"), 0);
});

test("shannonEntropy returns higher value for random string", () => {
  const entropy = shannonEntropy("aB3$x9!");
  assert.ok(entropy > 2);
});

test("isHighEntropy rejects short strings", () => {
  assert.strictEqual(isHighEntropy("abc123", 20), false);
});

test("isHighEntropy accepts long random base64 strings", () => {
  // Generate a 64-char random base64 string (entropy ~5.25)
  const random = crypto.randomBytes(48).toString("base64");
  assert.ok(random.length >= 64);
  assert.ok(isHighEntropy(random, 20));
});

test("isHighEntropy accepts long random hex strings", () => {
  const hex = crypto.randomBytes(32).toString("hex");
  assert.ok(hex.length >= 64);
  assert.ok(isHighEntropy(hex, 20));
});

test("isHighEntropy accepts alphanumeric random strings >= 32 chars", () => {
  const alpha = crypto.randomBytes(24).toString("base64url") + "extra";
  assert.ok(alpha.length >= 32);
  assert.ok(isHighEntropy(alpha, 32));
});

// ── Email ──────────────────────────────────────────────────────────────────
test("redacts standard email addresses", () => {
  const { sanitizedText } = sanitizeText("Contact john.doe@example.com please");
  assert.ok(!sanitizedText.includes("john.doe@example.com"));
  assert.ok(sanitizedText.includes("[REDACTED_EMAIL]"));
});

test("does not redact example.com-like strings without @", () => {
  const input = "Visit example.com for details";
  const { sanitizedText } = sanitizeText(input);
  assert.strictEqual(sanitizedText, input);
});

// ── AWS ────────────────────────────────────────────────────────────────────
test("redacts AWS access key IDs", () => {
  const input = "Use AKIAIOSFODNN7EXAMPLE for S3 access";
  const { sanitizedText } = sanitizeText(input);
  assert.ok(!sanitizedText.includes("AKIAIOSFODNN7EXAMPLE"));
  assert.ok(sanitizedText.includes("[REDACTED_AWS_ACCESS_KEY]"));
});

test("redacts AWS secret access keys (40-char base64)", () => {
  const key = "ThisIsAFakeTestKeyForUnitTestingPurposesOnly1";
  const input = `aws secret key: ${key}`;
  const { sanitizedText } = sanitizeText(input);
  assert.ok(!sanitizedText.includes(key));
  assert.ok(sanitizedText.includes("[REDACTED_AWS_SECRET_KEY]"));
});

// ── GitHub ─────────────────────────────────────────────────────────────────
test("redacts GitHub personal access tokens", () => {
  const token = "ghp_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFA";
  const input = `Token: ${token}`;
  const { sanitizedText } = sanitizeText(input);
  assert.ok(!sanitizedText.includes(token));
  // May be caught as GITHUB_PAT or GENERIC_SECRET depending on proximity
  const hasRedaction = sanitizedText.includes("[REDACTED_GITHUB_PAT]") ||
    sanitizedText.includes("[REDACTED_GENERIC_SECRET]");
  assert.ok(hasRedaction, "Expected some redaction for GitHub token");
});

// ── Google API Key ─────────────────────────────────────────────────────────
test("redacts Google API keys", () => {
  const key = "AIzaSyFAKE-FAKE-FAKE-FAKE-FAKE-FAKE-FFF";
  const input = `API key: ${key}`;
  const { sanitizedText } = sanitizeText(input);
  assert.ok(!sanitizedText.includes(key));
  assert.ok(sanitizedText.includes("[REDACTED_GOOGLE_API_KEY]"));
});

// ── Slack ──────────────────────────────────────────────────────────────────
test("redacts Slack user tokens", () => {
  const token = "xoxp-test-test-test-test-test-test-test-test-test-test";
  const input = `Slack token: ${token}`;
  const { sanitizedText } = sanitizeText(input);
  assert.ok(!sanitizedText.includes(token));
  assert.ok(sanitizedText.includes("[REDACTED_SLACK_TOKEN]"));
});

test("redacts Slack bot tokens", () => {
  const token = "xoxb-test-test-test-test-test-test-test-test-test-test";
  const input = `Bot token: ${token}`;
  const { sanitizedText } = sanitizeText(input);
  assert.ok(!sanitizedText.includes(token));
  assert.ok(sanitizedText.includes("[REDACTED_SLACK_TOKEN]"));
});

// ── Stripe ─────────────────────────────────────────────────────────────────
test("redacts Stripe live secret keys", () => {
  const key = "sk_test_FAKEFAKEFAKEFAKEFAKEFAKEFAKE";
  const input = `Stripe key: ${key}`;
  const { sanitizedText } = sanitizeText(input);
  assert.ok(!sanitizedText.includes(key));
  assert.ok(sanitizedText.includes("[REDACTED_STRIPE_KEY]"));
});

test("redacts Stripe test publishable keys", () => {
  const key = "pk_test_FAKEFAKEFAKEFAKEFAKEFAKEFAKE";
  const input = `Publishable key: ${key}`;
  const { sanitizedText } = sanitizeText(input);
  assert.ok(!sanitizedText.includes(key));
  assert.ok(sanitizedText.includes("[REDACTED_STRIPE_KEY]"));
});

// ── Twilio ─────────────────────────────────────────────────────────────────
test("redacts Twilio Account SID", () => {
  const sid = "ACFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE";
  const input = `Twilio SID: ${sid}`;
  const { sanitizedText } = sanitizeText(input);
  assert.ok(!sanitizedText.includes(sid));
  assert.ok(sanitizedText.includes("[REDACTED_TWILIO_SID]"));
});

// ── Mailgun ────────────────────────────────────────────────────────────────
test("redacts Mailgun API keys", () => {
  const key = "key-FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE";
  const input = `Mailgun key: ${key}`;
  const { sanitizedText } = sanitizeText(input);
  assert.ok(!sanitizedText.includes(key));
  assert.ok(sanitizedText.includes("[REDACTED_MAILGUN_API_KEY]"));
});

// ── Heroku ─────────────────────────────────────────────────────────────────
test("redacts Heroku API keys", () => {
  const key = "heroku api key = AFAE-AFAE-AFAE-AFAE-AFAE-AFAE";
  const input = key;
  const { sanitizedText } = sanitizeText(input);
  assert.ok(!sanitizedText.includes("AFAE-AFAE-AFAE-AFAE-AFAE-AFAE"));
  assert.ok(sanitizedText.includes("[REDACTED_HEROKU_API_KEY]"));
});

// ── Square ─────────────────────────────────────────────────────────────────
test("redacts Square access tokens", () => {
  const token = "sq0atp-TESTFAKETESTFAKETESTFAKETESTFA";
  const input = `Square token: ${token}`;
  const { sanitizedText } = sanitizeText(input);
  assert.ok(!sanitizedText.includes(token));
  assert.ok(sanitizedText.includes("[REDACTED_SQUARE_TOKEN]"));
});

// ── JWT ────────────────────────────────────────────────────────────────────
test("redacts JSON Web Tokens", () => {
  const token =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
  const input = `Bearer ${token}`;
  const { sanitizedText } = sanitizeText(input);
  assert.ok(!sanitizedText.includes(token));
  assert.ok(sanitizedText.includes("[REDACTED_JWT]"));
});

// ── Private Key ────────────────────────────────────────────────────────────
test("redacts PEM private key blocks", () => {
  const block = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
-----END RSA PRIVATE KEY-----`;
  const input = `Here is the key:\n${block}\nKeep it safe.`;
  const { sanitizedText } = sanitizeText(input);
  assert.ok(!sanitizedText.includes("BEGIN RSA PRIVATE KEY"));
  assert.ok(sanitizedText.includes("[REDACTED_PRIVATE_KEY]"));
});

// ── Connection String ──────────────────────────────────────────────────────
test("redacts database connection strings", () => {
  const input = "Connect with mongodb://user:pass@host:27017/db";
  const { sanitizedText } = sanitizeText(input);
  assert.ok(!sanitizedText.includes("mongodb://"));
  assert.ok(sanitizedText.includes("[REDACTED_CONNECTION_STRING]"));
});

// ── Password Assignment ────────────────────────────────────────────────────
test("redacts explicit password assignments", () => {
  const input = "password=hunter2";
  const { sanitizedText } = sanitizeText(input);
  assert.ok(!sanitizedText.includes("hunter2"));
  assert.ok(sanitizedText.includes("[REDACTED_PASSWORD_ASSIGN]"));
});

// ── Account Information ─────────────────────────────────────────────────────
test("redacts username assignments", () => {
  const input = "username=admin";
  const { sanitizedText } = sanitizeText(input);
  assert.ok(sanitizedText.includes("[REDACTED_USERNAME]"));
  assert.ok(!sanitizedText.includes("admin"));
});

test("redacts login assignments", () => {
  const input = "login: john.doe";
  const { sanitizedText } = sanitizeText(input);
  assert.ok(sanitizedText.includes("[REDACTED_USERNAME]"));
  assert.ok(!sanitizedText.includes("john.doe"));
});

test("redacts user_id assignments", () => {
  const input = "user_id = usr_12345";
  const { sanitizedText } = sanitizeText(input);
  assert.ok(sanitizedText.includes("[REDACTED_USER_ID]"));
  assert.ok(!sanitizedText.includes("usr_12345"));
});

test("redacts account_id assignments", () => {
  const input = "account_id: acct_987654321";
  const { sanitizedText } = sanitizeText(input);
  assert.ok(sanitizedText.includes("[REDACTED_ACCOUNT_ID]"));
  assert.ok(!sanitizedText.includes("acct_987654321"));
});

test("redacts tenant_id assignments", () => {
  const input = "tenant_id = tnt_abc123";
  const { sanitizedText } = sanitizeText(input);
  assert.ok(sanitizedText.includes("[REDACTED_ACCOUNT_ID]"));
  assert.ok(!sanitizedText.includes("tnt_abc123"));
});

test("redacts session tokens", () => {
  const input = "session = abcdefghijklmnopqrstuvwxyz123456";
  const { sanitizedText } = sanitizeText(input);
  assert.ok(sanitizedText.includes("[REDACTED_SESSION_TOKEN]"));
  assert.ok(!sanitizedText.includes("abcdefghijklmnopqrstuvwxyz123456"));
});

test("redacts CSRF tokens", () => {
  const input = "csrf_token: abcdefghijklmnopqrstuvwxyz123456";
  const { sanitizedText } = sanitizeText(input);
  assert.ok(sanitizedText.includes("[REDACTED_CSRF_TOKEN]"));
  assert.ok(!sanitizedText.includes("abcdefghijklmnopqrstuvwxyz123456"));
});

test("redacts bearer tokens", () => {
  const input = "authorization: Bearer abcdefghijklmnopqrstuvwxyz123456";
  const { sanitizedText } = sanitizeText(input);
  assert.ok(sanitizedText.includes("[REDACTED_BEARER_TOKEN]"));
  assert.ok(!sanitizedText.includes("abcdefghijklmnopqrstuvwxyz123456"));
});

test("redacts credential pairs (user + pass)", () => {
  const input = "user=admin, password=secret123";
  const { sanitizedText } = sanitizeText(input);
  assert.ok(sanitizedText.includes("[REDACTED_CREDENTIAL_PAIR]"));
  assert.ok(!sanitizedText.includes("admin"));
  assert.ok(!sanitizedText.includes("secret123"));
});

test("redacts OAuth client credentials", () => {
  const input = "client_id=abc123 client_secret=xyz789";
  const { sanitizedText } = sanitizeText(input);
  assert.ok(sanitizedText.includes("[REDACTED_OAUTH_CLIENT]"));
  assert.ok(!sanitizedText.includes("abc123"));
  assert.ok(!sanitizedText.includes("xyz789"));
});

test("redacts service account credentials", () => {
  const input = "service_account = svc_prod_01";
  const { sanitizedText } = sanitizeText(input);
  assert.ok(sanitizedText.includes("[REDACTED_OAUTH_CLIENT]"));
  assert.ok(!sanitizedText.includes("svc_prod_01"));
});

// ── Generic Secret (keyword proximity) ─────────────────────────────────────
test("redacts secrets adjacent to secret keywords", () => {
  const input = "api_key: abcdefghijklmnopqrstuvwxyz1234567890";
  const { sanitizedText } = sanitizeText(input, { mode: "lenient" });
  const hasRedaction = sanitizedText.includes("[REDACTED_GENERIC_SECRET]") ||
    sanitizedText.includes("[REDACTED_HIGH_ENTROPY_STRING]");
  assert.ok(hasRedaction, "Expected some redaction for generic secret");
});

// ── High Entropy Detection ─────────────────────────────────────────────────
test("redacts high-entropy strings in lenient mode", () => {
  const random = crypto.randomBytes(48).toString("base64");
  const input = `Use this token: ${random}`;
  const { sanitizedText } = sanitizeText(input, { mode: "lenient" });
  const hasRedaction = sanitizedText.includes("[REDACTED_HIGH_ENTROPY_STRING]") ||
    sanitizedText.includes("[REDACTED_GENERIC_SECRET]");
  assert.ok(hasRedaction, "Expected redaction for high-entropy string");
});

test("does not redact high-entropy strings in strict mode", () => {
  const random = crypto.randomBytes(48).toString("base64");
  const input = `Use this token: ${random}`;
  const { sanitizedText } = sanitizeText(input, { mode: "strict" });
  assert.ok(!sanitizedText.includes("[REDACTED_HIGH_ENTROPY_STRING]"));
});

test("does not flag common words as high entropy", () => {
  const input = "The quick brown fox jumps over the lazy dog";
  const { sanitizedText } = sanitizeText(input, { mode: "lenient" });
  assert.strictEqual(sanitizedText, input);
});

// ── Project Keywords ───────────────────────────────────────────────────────
test("redacts configured project keywords", () => {
  process.env.SENSITIVE_KEYWORDS = "Project Titan";
  const input = "We kicked off Project Titan yesterday";
  const { sanitizedText } = sanitizeText(input);
  assert.ok(sanitizedText.includes("[REDACTED_KEYWORD]"));
  assert.ok(!sanitizedText.includes("Project Titan"));
});

test("project keyword matching is case-insensitive", () => {
  process.env.SENSITIVE_KEYWORDS = "Project Titan";
  const input = "project titan is progressing well";
  const { sanitizedText } = sanitizeText(input);
  assert.ok(sanitizedText.includes("[REDACTED_KEYWORD]"));
});

// ── Allowlist ──────────────────────────────────────────────────────────────
test("preserves allowlisted strings", () => {
  const input = "Email support@tmasolutions.com for help";
  const { sanitizedText } = sanitizeText(input, {
    allowlist: ["support@tmasolutions.com"],
  });
  assert.ok(sanitizedText.includes("support@tmasolutions.com"));
  assert.ok(!sanitizedText.includes("[REDACTED_EMAIL]"));
});

// ── Strict Mode ────────────────────────────────────────────────────────────
test("strict mode ignores low-confidence patterns", () => {
  // PHONE_INTL has confidence 0.70; strict threshold is 0.90
  const input = "Call +1 123 456 7890 tomorrow";
  const { sanitizedText } = sanitizeText(input, { mode: "strict" });
  assert.strictEqual(sanitizedText, input);
});

test("strict mode ignores high-entropy detection", () => {
  const random = crypto.randomBytes(48).toString("base64");
  const input = `Use this token: ${random}`;
  const { sanitizedText } = sanitizeText(input, { mode: "strict" });
  assert.ok(!sanitizedText.includes("[REDACTED_HIGH_ENTROPY_STRING]"));
});

// ── Null / Empty Input ─────────────────────────────────────────────────────
test("handles empty string gracefully", () => {
  const { sanitizedText, report } = sanitizeText("");
  assert.strictEqual(sanitizedText, "");
  assert.strictEqual(report.originalLength, 0);
});

test("handles non-string input gracefully", () => {
  const { sanitizedText } = sanitizeText(null);
  assert.strictEqual(sanitizedText, "");
});

// ── Credit Cards (Visa / MasterCard / Amex / Discover) ───────────────────
// Valid test numbers (Luhn-valid, used for testing purposes)
const VISA_VALID = "4111111111111111"; // 16 digits, passes Luhn
const MC_VALID = "5555555555554444"; // 16 digits, passes Luhn
const AMEX_VALID = "378282246310005"; // 15 digits, passes Luhn
const DISCOVER_VALID = "6011000000000004"; // 16 digits, passes Luhn

test("redacts Visa card numbers (16 digits)", () => {
  const input = `Card: ${VISA_VALID}`;
  const { sanitizedText } = sanitizeText(input);
  assert.ok(!sanitizedText.includes(VISA_VALID));
  assert.ok(sanitizedText.includes("[REDACTED_VISA]"));
});

test("redacts MasterCard numbers (16 digits)", () => {
  const input = `Card: ${MC_VALID}`;
  const { sanitizedText } = sanitizeText(input);
  assert.ok(!sanitizedText.includes(MC_VALID));
  assert.ok(sanitizedText.includes("[REDACTED_MASTERCARD]"));
});

test("redacts American Express numbers (15 digits)", () => {
  const input = `Card: ${AMEX_VALID}`;
  const { sanitizedText } = sanitizeText(input);
  assert.ok(!sanitizedText.includes(AMEX_VALID));
  assert.ok(sanitizedText.includes("[REDACTED_AMEX]"));
});

test("redacts Discover card numbers (16 digits)", () => {
  const input = `Card: ${DISCOVER_VALID}`;
  const { sanitizedText } = sanitizeText(input);
  assert.ok(!sanitizedText.includes(DISCOVER_VALID));
  assert.ok(sanitizedText.includes("[REDACTED_DISCOVER]"));
});

test("does not redact invalid credit card numbers (Luhn fail)", () => {
  const invalid = "4111111111111112"; // same as Visa but last digit changed
  const input = `Card: ${invalid}`;
  const { sanitizedText } = sanitizeText(input);
  assert.strictEqual(sanitizedText, input);
});

test("does not redact random 16-digit numbers that fail Luhn", () => {
  const random16 = "1234567890123456";
  const input = `ID: ${random16}`;
  const { sanitizedText } = sanitizeText(input);
  assert.strictEqual(sanitizedText, input);
});

test("redacts formatted Visa with spaces", () => {
  const formatted = "4111 1111 1111 1111";
  const input = `Card: ${formatted}`;
  const { sanitizedText } = sanitizeText(input);
  assert.ok(!sanitizedText.includes("4111"));
  assert.ok(sanitizedText.includes("[REDACTED_VISA]"));
});

test("redacts formatted MasterCard with dashes", () => {
  const formatted = "5555-5555-5555-4444";
  const input = `Card: ${formatted}`;
  const { sanitizedText } = sanitizeText(input);
  assert.ok(!sanitizedText.includes("5555"));
  assert.ok(sanitizedText.includes("[REDACTED_MASTERCARD]"));
});

// ── Report Structure ───────────────────────────────────────────────────────
test("returns a valid sanitization report", () => {
  const input = "SSN: 123-45-6789";
  const { report } = sanitizeText(input);
  assert.ok(report.timestamp);
  assert.ok(Array.isArray(report.findings));
  assert.strictEqual(report.findings.length, 1);
  assert.strictEqual(report.findings[0].type, "SSN");
  assert.strictEqual(report.originalLength, input.length);
});

console.log("\nRunning sanitization tests...\n");

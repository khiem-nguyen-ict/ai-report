const fs = require("fs");
const path = require("path");

/**
 * Calculates Shannon entropy for a string.
 * Based on: C. E. Shannon, "A Mathematical Theory of Communication," 1948.
 * Used by gitleaks, truffleHog, and other secret scanners as the secondary
 * detection signal for arbitrary-format secrets.
 *
 * @param {string} str
 * @returns {number} Bits per symbol
 */
function shannonEntropy(str) {
  const freq = {};
  for (let i = 0; i < str.length; i++) {
    freq[str[i]] = (freq[str[i]] || 0) + 1;
  }
  let entropy = 0;
  for (const char in freq) {
    const p = freq[char] / str.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Validates a credit card number using the Luhn algorithm.
 * Strips non-digit characters before validation.
 * @param {string} str
 * @returns {boolean}
 */
function luhnValid(str) {
  const digits = str.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

/**
 * Determines if a candidate string has high entropy typical of a secret.
 * Aligns with gitleaks/truffleHog best-practice thresholds.
 *
 * IMPORTANT: Checks are ordered from most-specific to least-specific character
 * class to avoid misclassifying hex strings as base64.
 *
 * @param {string} str
 * @param {number} [minLength=20]
 * @returns {boolean}
 */
function isHighEntropy(str, minLength = 20) {
  if (str.length < minLength) return false;
  const entropy = shannonEntropy(str);

  // Hex-like tokens (0-9a-fA-F): secrets typically >= 3.0 bits/symbol
  if (/^[0-9a-fA-F]+$/.test(str)) {
    return entropy > 3.0;
  }
  // Base64-like tokens (A-Za-z0-9+/=_-): secrets typically >= 4.5 bits/symbol
  if (/^[A-Za-z0-9\/+=_-]+$/.test(str)) {
    return entropy >= 4.5;
  }
  // Alphanumeric (e.g., un-prefixed tokens): secrets typically >= 3.5 bits/symbol
  if (/^[A-Za-z0-9]+$/i.test(str) && str.length >= 32) {
    return entropy > 3.5;
  }
  return false;
}

/**
 * Built-in regex patterns for sensitive data detection.
 *
 * Each pattern object contains:
 *  - type:       Category label used in the redaction tag.
 *  - regex:      RegExp with the global flag.
 *  - confidence: 0.0 – 1.0 likelihood that a match is truly sensitive.
 */
const PATTERNS = [
  // ── Structured PII ─────────────────────────────────────────────────────
  {
    type: "EMAIL",
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    confidence: 0.95,
  },
  {
    type: "PHONE_US",
    regex: /\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/g,
    confidence: 0.85,
  },
  {
    type: "PHONE_INTL",
    // Lower confidence: overlaps with project codes / version numbers
    regex: /\+?\d{1,3}[\s.\-]?\(?\d{1,4}\)?[\s.\-]\d{1,4}[\s.\-]\d{1,9}/g,
    confidence: 0.70,
  },
  {
    type: "SSN",
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    confidence: 0.99,
  },
  {
    type: "CREDIT_CARD",
    // Generic 13-19 digit pattern with optional spaces/dashes (low confidence without Luhn)
    regex: /\b(?:\d[ -]*?){13,19}\b/g,
    confidence: 0.60,
  },
  {
    type: "VISA",
    // Starts with 4, length 13/16/19, with optional spaces/dashes
    regex: /\b4[0-9]{3}(?:[ -]?[0-9]{4}){2,4}\b/g,
    confidence: 0.90,
  },
  {
    type: "MASTERCARD",
    // Starts with 5[1-5], length 16, with optional spaces/dashes
    regex: /\b5[1-5][0-9]{2}(?:[ -]?[0-9]{4}){3}\b/g,
    confidence: 0.90,
  },
  {
    type: "AMEX",
    // Starts with 34 or 37, length 15, with optional spaces/dashes
    regex: /\b3[47][0-9]{2}[ -]?[0-9]{6}[ -]?[0-9]{5}\b/g,
    confidence: 0.90,
  },
  {
    type: "DISCOVER",
    // Starts with 6011 or 65, length 16, with optional spaces/dashes
    regex: /\b6(?:011|5[0-9]{2})[0-9]{4}(?:[ -]?[0-9]{4}){2}\b/g,
    confidence: 0.90,
  },

  // ── Account Information ────────────────────────────────────────────────
  {
    type: "USERNAME",
    regex:
      /\b(?:username|user|login|account)\s*[=:]\s*['"]?([a-zA-Z0-9._%+-]{3,})['"]?/gi,
    confidence: 0.75,
  },
  {
    type: "USER_ID",
    regex:
      /\b(?:user_id|userid|uid)\s*[=:]\s*['"]?([a-zA-Z0-9_-]{3,})['"]?/gi,
    confidence: 0.75,
  },
  {
    type: "ACCOUNT_ID",
    regex:
      /\b(?:account_id|account_number|acct_id|client_id|tenant_id|org_id|member_id|customer_id)\s*[=:]\s*['"]?([a-zA-Z0-9_-]{3,})['"]?/gi,
    confidence: 0.75,
  },
  {
    type: "SESSION_TOKEN",
    regex:
      /\b(?:session|sessionid|session_id|jsessionid|phpsessid)\s*[=:]\s*['"]?([a-zA-Z0-9\-._~+/]{10,})['"]?/gi,
    confidence: 0.80,
  },
  {
    type: "CSRF_TOKEN",
    regex:
      /\b(?:csrf|xsrf|csrf_token|xsrf_token)\s*[=:]\s*['"]?([a-zA-Z0-9\-._~+/]{10,})['"]?/gi,
    confidence: 0.80,
  },
  {
    type: "BEARER_TOKEN",
    regex:
      /\b(?:bearer|authorization)\s*[=:]?\s*['"]?([a-zA-Z0-9\-._~+/]{10,})['"]?/gi,
    confidence: 0.80,
  },
  {
    type: "CREDENTIAL_PAIR",
    regex:
      /\b(?:username|user|login|account)[_\s]*[=:][_\s]*['"]?([a-zA-Z0-9._%+-]{3,})['"]?[,\s]+(?:password|passwd|pwd|pass)[_\s]*[=:][_\s]*['"]?([^\s'"]{3,})['"]?/gi,
    confidence: 0.95,
  },
  {
    type: "OAUTH_CLIENT",
    regex:
      /\b(?:client_id|client_secret|app_id|app_secret|service_account)\s*[=:]\s*['"]?([a-zA-Z0-9._%+-]{3,})['"]?/gi,
    confidence: 0.75,
  },

  // ── Secrets & Credentials ──────────────────────────────────────────────
  {
    type: "AWS_ACCESS_KEY",
    regex: /\b(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\b/g,
    confidence: 0.99,
  },
  {
    type: "AWS_SECRET_KEY",
    // AWS Secret Access Keys are 40-character base64-like strings.
    // Flag only when near AWS-related keywords to reduce false positives.
    regex:
      /\b(?:aws|amazon)[_\s]*(?:secret|access)[_\s]?key\b[^\n]{0,30}([A-Za-z0-9\/+=]{40})\b/gi,
    confidence: 0.85,
  },
  {
    type: "GITHUB_PAT",
    regex: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36}\b/g,
    confidence: 0.99,
  },
  {
    type: "GOOGLE_API_KEY",
    regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g,
    confidence: 0.99,
  },
  {
    type: "SLACK_TOKEN",
    regex: /\b(xox[pbars]-[0-9a-zA-Z\-_.]{10,80})\b/g,
    confidence: 0.99,
  },
  {
    type: "STRIPE_KEY",
    regex: /\b(sk|pk|rk)_(live|test)_[0-9a-zA-Z]{24,}\b/g,
    confidence: 0.99,
  },
  {
    type: "TWILIO_SID",
    regex: /\bAC[a-zA-Z0-9_]{32}\b/g,
    confidence: 0.85,
  },
  {
    type: "TWILIO_TOKEN",
    regex: /\b[a-f0-9]{34}\b/g,
    confidence: 0.70,
  },
  {
    type: "MAILGUN_API_KEY",
    regex: /\bkey-[0-9a-zA-Z]{32}\b/g,
    confidence: 0.85,
  },
  {
    type: "HEROKU_API_KEY",
    regex: /\b(?:heroku[._-]?)?(?:api[._-]?)?key[._-]?[=:\s]+[0-9a-fA-F-]{25,40}\b/gi,
    confidence: 0.75,
  },
  {
    type: "SQUARE_TOKEN",
    regex: /\b(sq0atp|sq0csp)-[0-9A-Za-z\-_]{22,}\b/g,
    confidence: 0.99,
  },
  {
    type: "JWT",
    regex: /\beyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+?\.[A-Za-z0-9\-_]+\b/g,
    confidence: 0.99,
  },
  {
    type: "PRIVATE_KEY",
    regex:
      /-----BEGIN (?:RSA|DSA|EC|OPENSSH|PGP|SSH) PRIVATE KEY-----[\s\S]*?-----END (?:RSA|DSA|EC|OPENSSH|PGP|SSH) PRIVATE KEY-----/g,
    confidence: 0.99,
  },
  {
    type: "CONNECTION_STRING",
    regex: /\b(?:mongodb|mysql|postgres(?:ql)?|mssql|oracle|redis|amqp):\/\/[^\s]+/gi,
    confidence: 0.95,
  },
  {
    type: "PASSWORD_ASSIGN",
    regex: /\b(?:password|passwd|pwd|pass)\s*[=:]\s*(?:['"][^'"]{3,}['"]|[^\s]{3,})/gi,
    confidence: 0.90,
  },
  {
    type: "GENERIC_SECRET",
    // Matches high-entropy strings (20+ chars) adjacent to common secret keywords
    regex:
      /\b(?:api[_-]?key|token|secret|access[_-]?key|auth[_-]?token|private[_-]?key)\b[^\n]{0,30}\b([A-Za-z0-9\/+=_-]{20,})\b/gi,
    confidence: 0.75,
  },
];

/**
 * Loads project-sensitive keywords from the environment.
 * @returns {string[]}
 */
function loadProjectKeywords() {
  const raw = process.env.SENSITIVE_KEYWORDS || "";
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

/**
 * Loads the allowlist from the environment.
 * @returns {string[]}
 */
function loadAllowlist() {
  const raw = process.env.SANITIZATION_ALLOWLIST || "";
  return raw
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0);
}

/**
 * Determines the confidence threshold based on the configured mode.
 * @param {string} [modeOverride]
 * @returns {number}
 */
function getThreshold(modeOverride) {
  const mode = (modeOverride || process.env.SANITIZATION_MODE || "balanced").toLowerCase();
  switch (mode) {
    case "strict":
      return 0.90;
    case "lenient":
      return 0.50;
    case "balanced":
    default:
      return 0.75;
  }
}

/**
 * Builds a case-insensitive regex for project keywords with word boundaries.
 * @param {string[]} keywords
 * @returns {RegExp|null}
 */
function buildKeywordRegex(keywords) {
  if (!keywords.length) return null;
  const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = escaped.join("|");
  return new RegExp(`\\b(${pattern})\\b`, "gi");
}

/**
 * Detects standalone high-entropy strings that look like secrets but lack known prefixes.
 * Uses Shannon entropy to identify random-looking tokens of typical secret lengths.
 * @param {string} text
 * @param {number} threshold
 * @param {Set<string>} allowlist
 * @returns {{ type: string, original: string, replacement: string, confidence: number, index: number }[]}
 */
function detectHighEntropySecrets(text, threshold, allowlist) {
  if (threshold > 0.70) return [];

  // Candidate patterns: base64, hex, or alphanumeric strings of 20-120 chars
  const candidateRegex = /\b([A-Za-z0-9\/+=_-]{20,120})\b/g;
  const findings = [];
  let match;

  while ((match = candidateRegex.exec(text)) !== null) {
    const original = match[0];
    const index = match.index;

    // Skip if already allowlisted
    if (allowlist.has(original.toLowerCase())) continue;

    // Skip if it looks like a word (lowercase, spaces, common patterns)
    if (/[aeiou]{3,}/i.test(original) && original.length < 40) continue;

    // Check entropy
    if (!isHighEntropy(original)) continue;

    findings.push({
      type: "HIGH_ENTROPY_STRING",
      original,
      replacement: "[REDACTED_HIGH_ENTROPY_STRING]",
      confidence: 0.65,
      index,
    });
  }

  return findings;
}

/**
 * Sanitizes input text by detecting and redacting sensitive information.
 *
 * @param {string} text - Raw text to sanitize.
 * @param {object} [options] - Optional overrides.
 * @param {string} [options.mode] - strict | balanced | lenient.
 * @param {number} [options.threshold] - Override confidence threshold.
 * @param {string[]} [options.allowlist] - Strings to never redact.
 * @param {string[]} [options.keywords] - Override project keywords.
 * @returns {{ sanitizedText: string, report: object }}
 */
function sanitizeText(text, options = {}) {
  if (typeof text !== "string") {
    return {
      sanitizedText: "",
      report: { findings: [], originalLength: 0, sanitizedLength: 0 },
    };
  }

  const threshold = options.threshold ?? getThreshold(options.mode);
  const allowlist = new Set(
    (options.allowlist || loadAllowlist()).map((s) => s.toLowerCase())
  );

  const findings = [];
  let workingText = text;

  // ── 1. Apply built-in patterns ─────────────────────────────────────────
  for (const pattern of PATTERNS) {
    if (pattern.confidence < threshold) continue;

    pattern.regex.lastIndex = 0;
    let match;
    while ((match = pattern.regex.exec(workingText)) !== null) {
      const original = match[0];
      if (allowlist.has(original.toLowerCase())) continue;

      // Validate credit card patterns with Luhn algorithm
      if (
        pattern.type === "CREDIT_CARD" ||
        pattern.type === "VISA" ||
        pattern.type === "MASTERCARD" ||
        pattern.type === "AMEX" ||
        pattern.type === "DISCOVER"
      ) {
        if (!luhnValid(original)) continue;
      }

      findings.push({
        type: pattern.type,
        original,
        replacement: `[REDACTED_${pattern.type}]`,
        confidence: pattern.confidence,
        index: match.index,
      });
    }
  }

  // ── 2. Apply project keywords ──────────────────────────────────────────
  const keywords = options.keywords || loadProjectKeywords();
  if (keywords.length > 0) {
    const kwRegex = buildKeywordRegex(keywords);
    if (kwRegex) {
      kwRegex.lastIndex = 0;
      let match;
      while ((match = kwRegex.exec(workingText)) !== null) {
        const original = match[0];
        if (allowlist.has(original.toLowerCase())) continue;

        findings.push({
          type: "PROJECT_KEYWORD",
          original,
          replacement: "[REDACTED_KEYWORD]",
          confidence: 0.90,
          index: match.index,
        });
      }
    }
  }

  // ── 3. Apply high-entropy detection (only in lenient/balanced mode) ─────
  const entropyFindings = detectHighEntropySecrets(workingText, threshold, allowlist);
  findings.push(...entropyFindings);

  // ── 4. Deduplicate overlapping findings ─────────────────────────────────
  // Sort by start index ascending
  findings.sort((a, b) => a.index - b.index);

  const deduped = [];
  for (const f of findings) {
    const start = f.index;
    const end = f.index + f.original.length;
    let added = false;

    for (let i = 0; i < deduped.length; i++) {
      const d = deduped[i];
      const dStart = d.index;
      const dEnd = d.index + d.original.length;

      if (start < dEnd && end > dStart) {
        // Overlap detected — keep the more specific finding.
        // Specificity = higher confidence first, then shorter span.
        if (
          f.confidence > d.confidence ||
          (f.confidence === d.confidence && f.original.length < d.original.length)
        ) {
          deduped[i] = f;
        }
        added = true;
        break;
      }
    }

    if (!added) {
      deduped.push(f);
    }
  }
  deduped.sort((a, b) => b.index - a.index);

  // ── 5. Apply replacements in reverse index order ────────────────────────
  for (const finding of deduped) {
    workingText =
      workingText.slice(0, finding.index) +
      finding.replacement +
      workingText.slice(finding.index + finding.original.length);
  }

  const report = {
    timestamp: new Date().toISOString(),
    mode: options.mode || process.env.SANITIZATION_MODE || "balanced",
    threshold,
    findings: deduped,
    originalLength: text.length,
    sanitizedLength: workingText.length,
  };

  return { sanitizedText: workingText, report };
}

/**
 * Writes the sanitization report to disk for audit purposes.
 * @param {object} report
 */
function writeReport(report) {
  const reportPath = path.join(__dirname, "../../app-data/sanitization-report.json");
  try {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
  } catch (err) {
    console.warn("⚠️  Could not write sanitization report:", err.message);
  }
}

module.exports = {
  sanitizeText,
  writeReport,
  loadProjectKeywords,
  getThreshold,
  isHighEntropy,
  shannonEntropy,
  luhnValid,
};

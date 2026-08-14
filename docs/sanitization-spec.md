# Data Sanitization Function — Technical Specification & Implementation Plan

**Version:** 1.0  
**Status:** Draft  
**Component:** `src/utils/sanitize.js`  
**Owner:** AI Report Pipeline Team

---

## 1. Objective

Prevent the leakage of sensitive or proprietary information from Microsoft Teams messages to external Large Language Models (Gemini, Claude). The sanitization layer must act as a filtering gate between the Teams scraper and the LLM API, redacting PII, secrets, credentials, and project-sensitive keywords while preserving the contextual utility of the text for report generation.

---

## 2. Detection Logic

### 2.1 Structured PII
Detect high-confidence, pattern-based PII using deterministic regular expressions:
- **Email addresses** — standard RFC 5322-like patterns.
- **Phone numbers** — US formats (e.g., `(123) 456-7890`, `123-456-7890`) and international prefixes.
- **Social Security Numbers (SSN)** — `DDD-DD-DDDD` format.
- **Credit card numbers** — 13–16 digit sequences with common separators.

### 2.2 Account Information
Detect authentication context and identity attributes:
- **Usernames / Logins** — `username=`, `user:`, `login=` assignments.
- **User IDs** — `user_id`, `userid`, `uid` assignments.
- **Account IDs** — `account_id`, `account_number`, `client_id`, `tenant_id`, `org_id`, `member_id`, `customer_id`.
- **Session Tokens** — `session`, `sessionid`, `session_id`, `jsessionid`, `phpsessid`.
- **CSRF / XSRF Tokens** — `csrf`, `xsrf`, `csrf_token`, `xsrf_token`.
- **Bearer Tokens** — `bearer`, `authorization` prefixes.
- **OAuth / Service Accounts** — `client_id`, `client_secret`, `app_id`, `app_secret`, `service_account`.
- **Credential Pairs** — Simultaneous `user` + `password` patterns in the same vicinity.

### 2.3 Secrets & Credentials
Detect cryptographic keys, tokens, and connection strings:
- **API Keys / Tokens**
  - AWS Access Key IDs (`AKIA…`, `AGPA…`, etc.)
  - GitHub Personal Access Tokens (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`)
  - Google API Keys (`AIza…`)
  - JSON Web Tokens (JWT) — three Base64URL segments delimited by dots.
- **Credentials**
  - Database connection strings (`mongodb://`, `mysql://`, `postgresql://`, etc.)
  - PEM private key blocks (`-----BEGIN … PRIVATE KEY-----`)
  - Explicit password assignments (`password=…`, `pass: …`, `pwd: …`)

### 2.3 Project-Sensitive Keywords
Detect proprietary terminology via a configurable environment-variable list (`SENSITIVE_KEYWORDS`):
- Examples: `"Project Titan"`, `"Q3 Roadmap"`, `"Acquisition Target"`.
- Matching is case-insensitive with word-boundary awareness to avoid partial matches.

### 2.4 Entropy-Based Detection (Arbitrary-Format Secrets)
Detects secrets without known prefixes using **Shannon Entropy** (the algorithm used by `gitleaks`, `truffleHog`, and `detect-secrets`):
- **Base64-like tokens** (`A-Za-z0-9+/=_-`) — flagged when entropy ≥ 4.5 bits/symbol and length ≥ 20.
- **Hex-like tokens** (`0-9a-fA-F`) — flagged when entropy ≥ 3.0 bits/symbol and length ≥ 20.
- **Alphanumeric tokens** — flagged when entropy ≥ 3.5 bits/symbol and length ≥ 32.
- This catches arbitrary-format secrets like `sk38vksnvw452jf...` even without a recognizable prefix.

---

## 3. Filtering Techniques Comparison

| Technique | Effectiveness | Pros | Cons | Recommendation |
|-----------|---------------|------|------|----------------|
| **Regular Expressions** | High for structured PII & known secrets | Zero latency overhead; deterministic; no external dependencies; easy to audit | Brittle against implicit PII (e.g., `"Sarah lives at 123 Main St"`); broad patterns risk false positives | **Primary layer** — use for all high-confidence, format-specific secrets and PII. |
| **Named Entity Recognition (NER)** | High for contextual PII | Understands sentence structure; catches implicit people, orgs, and locations without explicit patterns | Requires model loading (MBs), slower inference; harder to deploy in lightweight Node.js; lower precision for secrets | **Optional future layer** — evaluate lightweight JS libraries (e.g., `compromise`) or a separate microservice. |
| **Pattern-Matching Libraries** (e.g., `detect-secrets`) | Very high for known secret formats | Maintained rule sets; security-team tested | Primarily secret-focused; many implementations are Python-first; adds dependency weight | **Adopt only if rule set outgrows internal maintenance** — start with in-house regex for full control. |

**Selected Strategy:** A **Hybrid Regex-First** approach. Regex covers structured secrets and PII with negligible latency. NER is deferred to Phase 3.

---

## 4. Handling Strategies

When sensitive data is detected, the sanitizer applies a configurable transformation:

### 4.1 Redaction (Recommended Default)
Replaces the sensitive span with a typed placeholder:
- `[REDACTED_EMAIL]`, `[REDACTED_PHONE_US]`, `[REDACTED_SSN]`
- `[REDACTED_USERNAME]`, `[REDACTED_ACCOUNT_ID]`, `[REDACTED_SESSION_TOKEN]`
- `[REDACTED_CREDENTIAL_PAIR]`, `[REDACTED_OAUTH_CLIENT]`
- `[REDACTED_API_KEY]`, `[REDACTED_AWS_ACCESS_KEY]`, `[REDACTED_JWT]`
- `[REDACTED_KEYWORD]`

**Why:** Preserves sentence structure and token counts, allowing the LLM to understand context (e.g., `"The [REDACTED_API_KEY] is expired"`).

### 4.2 Masking
Replaces with partial visibility (e.g., `a***@example.com`).

**Why:** Generally **not recommended** for this pipeline. It leaks entropy and is unnecessary for LLM report generation.

### 4.3 Complete Removal
Deletes the sensitive token entirely.

**Why:** Avoid unless the token is standalone. Removing `"password=hunter2"` yields `"password="`, which can confuse the model.

### 4.4 Recommended Policy
| Category | Strategy | Example Replacement |
|----------|----------|---------------------|
| Secrets / API Keys / JWTs | Full Redaction | `[REDACTED_API_KEY]` |
| PII (Email, Phone, SSN) | Full Redaction | `[REDACTED_EMAIL]` |
| Project Keywords | Full Redaction | `[REDACTED_KEYWORD]` |
| Explicit Password Assignments | Full Redaction | `[REDACTED_PASSWORD_ASSIGN]` |

---

## 5. Architecture Integration

### 5.1 Pipeline Position
The sanitizer must be inserted **immediately after Teams scraping and before prompt construction**.

```
Current Flow:
  Scrape Teams → Read messages.txt → Build Prompt → Send to LLM

New Flow:
  Scrape Teams → Read messages.txt → Sanitize → Build Prompt → Send to LLM
```

**Rationale:**
- **Maximum Coverage:** One sanitization pass guarantees 100% of outbound payload is filtered.
- **Minimal Latency:** Runs once per batch (<5 ms for typical message volumes). Adding it per-API-call inside the AI services would duplicate work and complicate state management.

### 5.2 Implementation Layer
- **Module:** `src/utils/sanitize.js`
- **Interface:** Synchronous function `sanitizeText(text, options)` returning `{ sanitizedText, report }`.
- **Rationale for Sync:** Regex evaluation on small text blocks is sub-millisecond. Avoiding `async` keeps `index.js` simple and eliminates callback/promise overhead.

### 5.3 Observability
- Write a JSON report to `app-data/sanitization-report.json` after every run.
- Report schema:
  ```json
  {
    "timestamp": "2026-08-14T09:30:00.000Z",
    "mode": "balanced",
    "threshold": 0.75,
    "findings": [
      {
        "type": "EMAIL",
        "original": "john@example.com",
        "replacement": "[REDACTED_EMAIL]",
        "confidence": 0.95,
        "index": 42
      }
    ],
    "originalLength": 4500,
    "sanitizedLength": 4480
  }
  ```

---

## 6. False Positive Management

### 6.1 Confidence Thresholds
Every pattern carries a `confidence` score (0.0–1.0). The sanitizer compares this against a mode-dependent threshold:

| Mode | Threshold | Behavior |
|------|-----------|----------|
| `strict` | 0.90 | Only highest-confidence patterns + keywords. Minimal false positives. |
| `balanced` (default) | 0.75 | High-confidence patterns + context-aware secrets. |
| `lenient` | 0.50 | Broad coverage; higher false positive risk. |

### 6.2 Allowlist & Denylist
- **Allowlist (`SANITIZATION_ALLOWLIST`):** Comma-separated strings that are **never** redacted (e.g., `support@tmasolutions.com`, `Project Phoenix` if publicly known).
- **Denylist (`SANITIZATION_DENYLIST`):** Comma-separated strings that are **always** redacted, even if confidence is marginal.

### 6.3 Contextual Exclusion
- Skip double-redaction if a span has already been replaced.
- If NER is enabled in a future phase, exclude entities that match configured HR people (names are expected in daily reports).

### 6.4 Audit Mode
Set `SANITIZATION_MODE=audit` to wrap redactions in HTML comments instead of replacing them:
- Output: `"Email john<!--REDACTED:john@example.com-->@example.com"`
- Enables manual review without blocking the pipeline.

### 6.5 Iterative Tuning
- Review `sanitization-report.json` weekly.
- Add recurrent false positives to the allowlist.
- Add newly discovered secret patterns to the built-in regex library.

---

## 7. Implementation Plan

### Phase 1 — Foundation: Regex + Keywords
1. Implement `src/utils/sanitize.js` with built-in pattern library.
2. Integrate into `index.js` between `messages.txt` read and `buildPrompt`.
3. Add `.env` variables: `SANITIZATION_MODE`, `SENSITIVE_KEYWORDS`, `SANITIZATION_ALLOWLIST`.
4. Write unit tests in `src/tests/test-sanitize.js`.

### Phase 2 — Observability
1. Implement report logging (`sanitization-report.json`).
2. Add audit mode for non-destructive review.

### Phase 3 — Advanced Detection
1. Evaluate lightweight JS NER or secrets libraries.
2. Add optional `NER_ENABLED` flag.
3. Benchmark latency impact (<10 ms target).

### Phase 4 — Continuous Improvement
1. Establish a bi-weekly review cadence for sanitization logs.
2. Update regexes and keyword list based on production findings.

---

## 8. Security Considerations

- **Log Sensitivity:** `sanitization-report.json` contains redacted matches and must be excluded from version control (`.gitignore`), encrypted at rest, and rotated regularly.
- **Memory Safety:** The sanitizer runs in the same process as the scraper. Ensure no secrets are printed to `console.log` in production.
- **Dependency Hygiene:** Avoid heavy ML dependencies in the initial release to reduce the attack surface. If NER is added, pin the model version and load from a trusted registry.

---

## 9. Testing Strategy

Unit tests must cover:
- Positive detection for every built-in regex pattern.
- Negative detection (e.g., `"example.com"` should not trigger `[REDACTED_EMAIL]`).
- Keyword matching (case sensitivity, word boundaries).
- Allowlist bypass.
- Mode switching (`strict`, `balanced`, `lenient`).
- Handling of `null`, `undefined`, and empty strings.
- Report generation schema validation.

---

*End of Specification*

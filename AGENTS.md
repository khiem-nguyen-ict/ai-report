# AGENTS.md

Guidance for coding agents working in this repository.

---

## 📍 Quick Direction Map

| Goal | Entry Point | Key Files |
|------|-------------|-----------|
| **Run full pipeline** | `./run.sh` or `node index.js` | `index.js` → `src/services/ms-team.js` → `src/utils/sanitize.js` → `src/templates/prompt-template.js` → AI engine → `src/services/send-mail.js` |
| **Notify-only (Teams reminder)** | `./run.sh --notify` or `node index.js --notify` | `index.js` → `src/services/ms-team.js:sendReminder()` |
| **Test sanitization** | `npm test` | `src/tests/test-sanitize.js` → `src/utils/sanitize.js` |
| **Test Cohere API** | `node src/tests/cohere-test.js` | `src/tests/cohere-test.js` → `src/services/cohere.js` |
| **Change AI engine** | Edit `.env` | `AI_ENGINE=CLAUDE\|GEMINI\|COHERE` |
| **Modify report template** | Edit template files | `src/templates/prompt.txt`, `brand.css`, `artifact-template.html`, `prompt-template.js` |
| **Adjust sanitization rules** | Edit `.env` or code | `SANITIZATION_MODE`, `SENSITIVE_KEYWORDS`, `SANITIZATION_ALLOWLIST` in `.env`; `src/utils/sanitize.js` for logic |

---

## Project Overview

- **Name:** `ai-report` (Node.js/CommonJS)
- **Purpose:** Scrape daily messages from Microsoft Teams, sanitize sensitive data, generate an HTML daily report with an AI engine (Claude, Gemini, or Cohere), then send the report via Zimbra webmail. Optional macOS KakaoTalk posting can follow in `run.sh`.
- **Main entrypoint:** `index.js`
- **Primary run script:** `run.sh`

---

## Pipeline (Default Mode)

`index.js` orchestrates:

1. **Scrape Teams:** `src/services/ms-team.js` opens Teams in Playwright persistent profile `teams-profile/`, collects last-day messages from `MS_TEAM_GROUP_NAME` (and optionally `ADDITIONAL_MS_TEAM_GROUP_NAME`), writes `app-data/messages.json` and `app-data/messages.txt`.
2. **Date/title:** `src/utils/index.js` derives report date from `messages.json` and builds email/report title using week/sprint config from `.env`.
3. **Sanitize:** `src/utils/sanitize.js` redacts sensitive data from `messages.txt` and writes audit report to `app-data/sanitization-report.json`.
4. **Prompt build:** `src/templates/prompt-template.js` combines `prompt.txt`, `brand.css`, `artifact-template.html`, env-driven HR config, and sanitized log.
5. **AI generation:** selected by `AI_ENGINE` in `.env`:
   - `CLAUDE` → `src/services/claude.js` (Playwright, persistent `user-data/`, downloads artifact)
   - `GEMINI` → `src/services/gemini.js` (Playwright + stealth, persistent `user-data/`)
   - `COHERE` → `src/services/cohere.js` (REST API, no browser)
   Output: `app-data/report_YYYY-MM-DD.html`.
6. **Validate HTML:** `index.js` aborts if output is not a valid HTML document.
7. **Send mail:** `src/services/send-mail.js` sends report through Zimbra webmail via Playwright using session dir `.zimbra-session/`.

**Notify-only mode:** `node index.js --notify` (or `./run.sh --notify`) only sends a random Teams reminder from `REMINDER_MESSAGES` and skips report generation/mail/KakaoTalk steps.

---

## Key Directories/Files

```
ai-report/
├── index.js                    # Pipeline orchestration, CLI flags (--notify)
├── run.sh                      # Loads .env, runs Node pipeline, then kakao-talk.sh
├── package.json                # npm scripts: test, start
├── .env                        # Local config (gitignored) — copy from .env.sample
├── .env.sample                 # Template with all supported variables
├── .gitignore                  # Excludes: user-data/, teams-profile/, app-data/, .zimbra-session/, .env*, .DS_Store, .kilo/
├── src/
│   ├── services/
│   │   ├── ms-team.js          # Teams login/session, group navigation, message scraping, reminder sending
│   │   ├── claude.js           # Browser automation against claude.ai, artifact download
│   │   ├── gemini.js           # Browser automation against gemini.google.com/app
│   │   ├── cohere.js           # Cohere v2 Chat API call, retry/fence-stripping/HTML extraction
│   │   ├── send-mail.js        # Zimbra Classic webmail automation
│   │   └── kakao-talk.sh       # macOS-only KakaoTalk automation (cliclick, AppleScript)
│   ├── templates/
│   │   ├── prompt-template.js  # Builds final prompt from parts
│   │   ├── prompt.txt          # Base prompt template
│   │   ├── brand.css           # Fixed report styling
│   │   └── artifact-template.html # HTML wrapper for AI output
│   ├── utils/
│   │   ├── index.js            # Browser lock cleanup, date/week/sprint/report-title helpers
│   │   └── sanitize.js         # Regex + Shannon-entropy sanitization, modes/allowlist/keywords, audit report
│   └── tests/
│       ├── test-sanitize.js    # Sanitization unit tests (npm test)
│       ├── cohere-test.js      # Cohere API integration test (requires COHERE_API_KEY)
│       ├── test-gemini.js      # Gemini smoke test
│       └── test-mail.js        # Mail send test
├── docs/
│   └── sanitization-spec.md    # Detailed sanitization design/spec
├── app-data/                   # Runtime artifacts (gitignored): messages.json, messages.txt, prompt_sent.txt, report_*.html, sanitization-report.json
├── teams-profile/              # Persistent Teams browser profile (gitignored, sensitive)
├── user-data/                  # Persistent AI browser profiles (gitignored, sensitive)
└── .zimbra-session/            # Persistent Zimbra session (gitignored, sensitive)
```

---

## Configuration (`.env`)

Copy from `.env.sample`. Important variables:

- **Teams/scraping:** `MS_TEAM_GROUP_NAME`, `ADDITIONAL_MS_TEAM_GROUP_NAME`, `MAX_CHAT_SCROLL_UP`, `REMINDER_MESSAGES` (JSON array string).
- **Report identity/schedule:** `COMPANY`, `CLIENT`, `PROJECT`, `FROM_NAME`, `PROJECT_START_DATE` (`yyyy/mm/dd` expected by utils), `START_SPRINT`, `START_WEEK`, `NUMBER_OF_WEEKS_PER_SPRINT`.
- **AI engine:** `AI_ENGINE=CLAUDE|GEMINI|COHERE`.
  - Cohere: `COHERE_API_KEY` (required), optional `COHERE_MODEL` (default `command-a-03-2025`).
- **Email/Zimbra:** `ZIMBRA_URL`, `EMAIL_USER`, `EMAIL_PASS`, `TO_RECIPIENTS`, `CC_RECIPIENTS`.
- **HR/prompt:** `HR_FIXED_PEOPLE` (`Name:Role:MaxEffort:Billable` entries), `HR_CONDITIONAL_PEOPLE` (`Name:Role:MaxEffort`).
- **Sanitization:** `SANITIZATION_MODE` (`strict|balanced|lenient|audit`), `SENSITIVE_KEYWORDS`, `SANITIZATION_ALLOWLIST`.
- **KakaoTalk:** `KAKAO_TALK_GROUP_NAME` (used by `kakao-talk.sh`).

> **Do not commit** `.env`, browser profiles/session dirs, or generated `app-data` contents containing real messages/reports.

---

## Development Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `./run.sh` | Full pipeline (loads `.env`, runs Node, then KakaoTalk) |
| `node index.js` | Full pipeline (Node only, no KakaoTalk) |
| `./run.sh --notify` | Notify-only: sends Teams reminder, exits |
| `node index.js --notify` | Notify-only (Node only) |
| `npm test` | Run sanitization tests (`node src/tests/test-sanitize.js`) |
| `node src/tests/cohere-test.js` | Test Cohere API (requires `COHERE_API_KEY`, makes real calls) |
| `node src/tests/test-gemini.js` | Quick Gemini smoke test |
| `node src/tests/test-mail.js` | Quick mail send test |

> **No lint/build/typecheck scripts** are defined in `package.json`.

---

## Code Conventions

- **Module system:** CommonJS (`"type": "commonjs"` in `package.json`). Use `require`/`module.exports` exclusively.
- **Error handling:** Services log concise reasons; never dump full request/response bodies. Pipeline exits with `process.exit(1)` on failure (see `index.js:114-119`).
- **Async/await:** All service entry points are `async` functions returning `Promise`.
- **Environment access:** Always via `process.env` (loaded by `dotenv` in `index.js` and `run.sh`).
- **File paths:** Use `path.join(__dirname, ...)` for repo-relative paths.
- **Logging:** Prefix with emoji for quick scanning: `🚀` start, `✅` success, `❌` error, `📧` email, `🔍` debug.
- **No hardcoded secrets:** All credentials via `.env` only.
- **Browser automation:** Uses Playwright with persistent profiles. First runs may require manual login/CAPTCHA/2FA.
- **HTML output contract:** Generated report must be a complete HTML document; `index.js` validates with `<!DOCTYPE html>` or `<html>` tag check.

---

## ⚠️ DO NOT TOUCH (Protected Paths & Behaviors)

| Path/Pattern | Reason |
|--------------|--------|
| `.env` | Contains secrets; gitignored |
| `.env*` (except `.env.sample`) | Local overrides; gitignored |
| `teams-profile/` | Persistent Teams session (cookies, auth); gitignored, sensitive |
| `user-data/` | Persistent AI browser sessions; gitignored, sensitive |
| `.zimbra-session/` | Persistent Zimbra session; gitignored, sensitive |
| `app-data/` | Runtime output (messages, reports, screenshots); gitignored |
| `node_modules/` | Dependencies; gitignored |
| `.DS_Store` | macOS metadata; gitignored |
| `.kilo/` | Kilo config; gitignored |
| `src/services/kakao-talk.sh` | macOS-specific; requires `cliclick` + AppleScript permissions; runs only in `run.sh` |
| `docs/sanitization-spec.md` | Source of truth for sanitization behavior; update tests if changing logic |
| `src/templates/brand.css` | Fixed branding; changing affects all reports |
| `src/templates/artifact-template.html` | HTML wrapper; must remain valid HTML structure |
| `package.json` `"type": "commonjs"` | Do not change to ESM |

---

## Implementation Notes & Gotchas

- **Browser automation is stateful and interactive:** First runs may require manual login/CAPTCHA/2FA for Teams, Claude, Gemini, or Zimbra. Persistent profiles live in repo-local directories noted above.
- **Engine differences:** Claude/Gemini flows depend on current web UI selectors and can be brittle; Cohere is API-based and preferred for unattended runs when configured.
- **Output contract:** Generated report must be a complete HTML document; `index.js` fails fast if not.
- **Sanitization is a safety gate:** Changes here affect what leaves the machine—preserve redaction behavior, audit reporting, and configurable modes/keywords/allowlists; add/update tests in `src/tests/test-sanitize.js`.
- **KakaoTalk step is macOS-specific** and runs after Node pipeline in `run.sh` (skipped in notify-only mode).
- **Generated/sensitive artifacts:** Avoid editing or committing files under `app-data/`, `teams-profile/`, `user-data/`, `.zimbra-session/`, and `.env`.

---

## When Making Changes

- Read relevant service/template/util files before editing; behavior is split across small modules.
- Prefer minimal, targeted fixes that preserve the existing pipeline contract and env-driven configuration.
- If you change prompt/template/branding, ensure output remains valid, self-contained HTML compatible with downstream validation and email sending.
- If you change sanitization, run `npm test` and consider edge cases from `docs/sanitization-spec.md`.
- Do not introduce secrets, hardcode credentials, or log sensitive scraped content unnecessarily.
# AGENT.md

Guidance for coding agents working in this repository.

## Project overview
- **Name:** `ai-report` (Node.js/CommonJS)
- **Purpose:** Scrape daily messages from Microsoft Teams, sanitize sensitive data, generate an HTML daily report with an AI engine (Claude, Gemini, or Cohere), then send the report via Zimbra webmail. Optional macOS KakaoTalk posting can follow in `run.sh`.
- **Main entrypoint:** `index.js`
- **Primary run script:** `run.sh`

## Pipeline (default mode)
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

## Key directories/files
- `index.js` — pipeline orchestration and CLI flag handling (`--notify`).
- `run.sh` — loads `.env`, runs Node pipeline, then runs `src/services/kakao-talk.sh` unless notify-only.
- `src/services/ms-team.js` — Teams login/session handling, group navigation, message scraping, reminder sending.
- `src/services/claude.js` — browser automation against `https://claude.ai`, artifact download.
- `src/services/gemini.js` — browser automation against `https://gemini.google.com/app`.
- `src/services/cohere.js` — Cohere v2 Chat API call, retry/fence-stripping/HTML extraction.
- `src/services/send-mail.js` — Zimbra Classic webmail automation.
- `src/services/kakao-talk.sh` — macOS-only KakaoTalk automation (`cliclick`, AppleScript permissions required).
- `src/templates/prompt-template.js`, `prompt.txt`, `brand.css`, `artifact-template.html` — report prompt and fixed branding/template.
- `src/utils/index.js` — browser lock cleanup, date/week/sprint/report-title helpers.
- `src/utils/sanitize.js` — regex + Shannon-entropy sanitization, modes/allowlist/keywords, audit report writer.
- `src/tests/` — test scripts (`test-sanitize.js`, `cohere-test.js`, etc.); not all are wired as npm scripts.
- `docs/sanitization-spec.md` — detailed sanitization design/spec.
- `app-data/` — runtime artifacts (messages, prompt, reports, screenshots, sanitization report). Treated as data/output; mostly gitignored.
- `teams-profile/`, `user-data/`, `.zimbra-session/` — persistent browser/session state (gitignored, sensitive).

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

Do not commit `.env`, browser profiles/session dirs, or generated `app-data` contents containing real messages/reports.

## Development commands
- **Install:** `npm install`
- **Run pipeline:** `./run.sh` or `node index.js`
- **Notify-only:** `./run.sh --notify` or `node index.js --notify`
- **Sanitization tests:** `npm test` (runs `node src/tests/test-sanitize.js`)
- **Cohere API test:** `node src/tests/cohere-test.js` (requires `COHERE_API_KEY`; makes real API calls)

No lint/build/typecheck scripts are defined in `package.json`.

## Implementation notes and gotchas
- **CommonJS project** (`"type": "commonjs"`). Keep `require/module.exports` style consistent with existing code.
- **Browser automation is stateful and interactive:** first runs may require manual login/CAPTCHA/2FA for Teams, Claude, Gemini, or Zimbra. Persistent profiles live in repo-local directories noted above.
- **Engine differences:** Claude/Gemini flows depend on current web UI selectors and can be brittle; Cohere is API-based and preferred for unattended runs when configured.
- **Output contract:** generated report must be a complete HTML document; `index.js` fails fast if not.
- **Sanitization is a safety gate:** changes here affect what leaves the machine—preserve redaction behavior, audit reporting, and configurable modes/keywords/allowlists; add/update tests in `src/tests/test-sanitize.js`.
- **KakaoTalk step is macOS-specific** and runs after Node pipeline in `run.sh` (skipped in notify-only mode).
- **Generated/sensitive artifacts:** avoid editing or committing files under `app-data/`, `teams-profile/`, `user-data/`, `.zimbra-session/`, and `.env`.

## When making changes
- Read relevant service/template/util files before editing; behavior is split across small modules.
- Prefer minimal, targeted fixes that preserve the existing pipeline contract and env-driven configuration.
- If you change prompt/template/branding, ensure output remains valid, self-contained HTML compatible with downstream validation and email sending.
- If you change sanitization, run `npm test` and consider edge cases from `docs/sanitization-spec.md`.
- Do not introduce secrets, hardcode credentials, or log sensitive scraped content unnecessarily.

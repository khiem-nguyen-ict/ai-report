# AI Report Generator

An automated system that scrapes messages from Microsoft Teams, processes them with AI (Claude, Gemini, or Cohere), generates HTML reports, and sends them via email.

## Project Structure

```
ai-report/
├── index.js                  # Main entry point - orchestrates the pipeline
├── package.json              # Project dependencies and scripts
├── .env.sample               # Environment variables template
├── run.sh                    # Shell script to run the application
├── src/
│   ├── services/             # Service implementations
│   │   ├── ms-team.js        # Microsoft Teams scraping (Playwright)
│   │   ├── claude.js         # Claude AI interaction
│   │   ├── gemini.js         # Gemini AI interaction
│   │   ├── cohere.js         # Cohere API interaction (no browser)
│   │   ├── send-mail.js      # Email sending functionality
│   │   └── kakao-talk.sh     # KakaoTalk automation (macOS only)
│   ├── templates/            # Template processing
│   │   ├── prompt-template.js # Prompt builder for AI
│   │   ├── prompt.txt         # Static prompt text with placeholders
│   │   ├── brand.css          # Company brand CSS spec
│   │   └── artifact-template.html # HTML artifact template
│   ├── utils/                # Utility functions
│   │   ├── index.js          # Date extraction, report title generation, browser cleanup
│   │   └── sanitize.js       # Data sanitization and sensitive information redaction
│   └── tests/                # Test files
│       ├── test-utils.js
│       ├── test-gemini.js
│       ├── cohere-test.js    # Cohere service test
│       ├── test-mail.js
│       └── test-sanitize.js  # Sanitization unit tests
├── app-data/                 # Data storage (messages, prompts, reports)
│   ├── messages.json         # Scraped Teams messages in JSON format
│   ├── messages.txt          # Scraped Teams messages in text format
│   ├── prompt_sent.txt       # Last prompt sent to AI
│   ├── sanitization-report.json # Audit log of redacted sensitive data
│   └── report_*.html         # Generated HTML reports
└── teams-profile/            # Persistent browser profile for Teams
```

## Features

- **Microsoft Teams Integration**: Automatically logs into Teams (saves session for future runs) and scrapes messages from specified groups
- **AI Processing**: Sends scraped messages to Claude AI, Gemini AI, or the Cohere API for report generation
- **Report Generation**: Creates professional HTML reports with TMA Solutions branding
- **Email Delivery**: Sends generated reports via email using Nodemailer
- **Persistent Sessions**: Maintains login sessions to avoid repeated authentication
- **Configurable**: Easily switch between AI engines via environment variables
- **Customizable Reminders**: Configurable random reminder messages for MS Teams notify mode
- **KakaoTalk Automation**: Optional KakaoTalk group message sending via `cliclick` (macOS only)
- **Data Sanitization**: Redacts sensitive information before sending data to LLM APIs, including PII, secrets, credentials, account information, and project-sensitive keywords

## Pipeline

1. **Scrape Messages**: Extract today's messages from Microsoft Teams using Playwright
2. **Extract Date**: Get the last date from messages.json for report naming
3. **Sanitize Data**: Redact sensitive information (PII, secrets, credentials, keywords) from scraped messages
4. **Build Prompt**: Create a prompt with fixed TMA Solutions branding + dynamic categories
5. **AI Generation**: Send sanitized prompt to Claude, Gemini, or Cohere, wait for HTML artifact generation
6. **Email Report**: Send the generated HTML report via email

## AI Engines

Set `AI_ENGINE` in `.env` to pick the engine. All three consume the same prompt and must produce a complete HTML document at the target path — `index.js` validates the output is HTML and aborts if it isn't.

| `AI_ENGINE` | Service | Interface | Requires |
|--------------|---------|-----------|----------|
| `CLAUDE` (default) | `src/services/claude.js` | Browser (Playwright) | Manual login on first run |
| `GEMINI` | `src/services/gemini.js` | Browser (Playwright + stealth) | Manual login on first run |
| `COHERE` | `src/services/cohere.js` | REST API (Axios) | `COHERE_API_KEY` |

### Cohere

Cohere is the only engine that uses a direct API call rather than browser automation, so it needs no login, no manual CAPTCHA handling, and no Playwright window — which makes it the most reliable option for unattended/cron runs.

- Get a key at [dashboard.cohere.com](https://dashboard.cohere.com); a trial key is created automatically with the account.
- Set `COHERE_API_KEY` (and optionally `COHERE_MODEL`, default `command-a-03-2025`).
- The service posts to the Cohere v2 Chat API with a system prompt that asks for a complete, self-contained HTML document with inline CSS, then strips any markdown fences the model may wrap the answer in.
- Standalone test: `node src/tests/cohere-test.js` (makes two billable API calls).

#### Cohere free/trial API limitations

The free trial key is meant for evaluation, not production:

- **1,000 API calls per month**, shared across all endpoints. One pipeline run makes one Chat call, so a daily schedule stays well within this.
- **20 requests per minute** for Chat models (Command A, Command R+, Command R, Command R7B). Exceeding a limit returns `429 Too Many Requests` and the run fails — there is no automatic retry/backoff in `cohere.js`.
- **Trial keys are not permitted for production or commercial use.** If this pipeline is used commercially, a production key is required.
- Trial access to newer variants (Command A Reasoning, Translate, Vision) is also capped at 1,000 calls/month, and those models have no self-serve production rate limit — they are contact-sales only.
- For production keys, Command A and Command R-family models are rate limited at 500 requests/min and billed per token (Command A: $1.00/1M input, $2.00/1M output). Check [cohere.com/pricing](https://cohere.com/pricing) for current figures.

Raise `max_tokens` or lower the report size in the prompt if a long day of messages gets truncated mid-document.

## Data Sanitization

The sanitization layer acts as a security gate between Teams data and LLM APIs. It detects and redacts sensitive information using a hybrid approach: **regex pattern matching** for known formats and **Shannon entropy analysis** for arbitrary-format secrets (the same algorithm used by `gitleaks`, `truffleHog`, and `detect-secrets`).

### Detected Sensitive Information Categories

#### Structured PII
- **Email addresses** — standard RFC 5322-like patterns
- **Phone numbers** — US formats (`(123) 456-7890`, `123-456-7890`) and international prefixes
- **Social Security Numbers (SSN)** — `DDD-DD-DDDD` format
- **Credit card numbers** — 13–16 digit sequences with common separators
  - **Visa** — 13/16/19 digits starting with `4`, validated with Luhn algorithm
  - **MasterCard** — 16 digits starting with `51`–`55`, validated with Luhn algorithm
  - **American Express** — 15 digits starting with `34` or `37`, validated with Luhn algorithm
  - **Discover** — 16 digits starting with `6011` or `65`, validated with Luhn algorithm

#### Account Information
- **Usernames / Logins** — `username=`, `user:`, `login=` assignments
- **User IDs** — `user_id`, `userid`, `uid` assignments
- **Account IDs** — `account_id`, `account_number`, `client_id`, `tenant_id`, `org_id`, `member_id`, `customer_id`
- **Session Tokens** — `session`, `sessionid`, `session_id`, `jsessionid`, `phpsessid`
- **CSRF / XSRF Tokens** — `csrf`, `xsrf`, `csrf_token`, `xsrf_token`
- **Bearer Tokens** — `bearer`, `authorization` prefixes
- **OAuth / Service Accounts** — `client_id`, `client_secret`, `app_id`, `app_secret`, `service_account`
- **Credential Pairs** — Simultaneous `user` + `password` patterns in the same vicinity

#### Secrets & Credentials
- **API Keys / Tokens**
  - AWS Access Key IDs (`AKIA…`, `AGPA…`, etc.)
  - AWS Secret Access Keys (40-character base64 strings)
  - GitHub Personal Access Tokens (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`)
  - Google API Keys (`AIza…`)
  - Slack Tokens (`xoxp-`, `xoxb-`, `xoxa-`, `xoxr-`, `xoxs-`)
  - Stripe Keys (`sk_live_`, `sk_test_`, `pk_live_`, `pk_test_`, `rk_live_`, `rk_test_`)
  - Twilio Account SID (`AC...`) and Auth Tokens
  - Mailgun API Keys (`key-...`)
  - Heroku API Keys
  - Square Access Tokens (`sq0atp-`, `sq0csp-`)
  - JSON Web Tokens (JWT) — three Base64URL segments delimited by dots
- **Private Keys** — PEM blocks (`-----BEGIN ... PRIVATE KEY-----`)
- **Database Connection Strings** — `mongodb://`, `mysql://`, `postgresql://`, `mssql://`, `oracle://`, `redis://`, `amqp://`
- **Password Assignments** — Explicit `password=`, `pass:`, `pwd:` patterns
- **Generic Secrets** — High-entropy strings adjacent to keywords like `api_key`, `token`, `secret`, `access_key`
- **Arbitrary-Format Secrets** — Any high-entropy string (detected via Shannon entropy) without known prefixes, e.g., `sk38vksnvw452jf...`

#### Project-Sensitive Keywords
- Configurable list of proprietary terms (e.g., `"Project Titan"`, `"Q3 Roadmap"`)
- Case-insensitive matching with word-boundary awareness

### Handling Strategies

| Category | Strategy | Example Replacement |
|----------|----------|---------------------|
| Secrets / API Keys / JWTs | Full Redaction | `[REDACTED_API_KEY]` |
| Account Information | Full Redaction | `[REDACTED_USERNAME]`, `[REDACTED_ACCOUNT_ID]` |
| PII (Email, Phone, SSN) | Full Redaction | `[REDACTED_EMAIL]` |
| Credit Cards (Visa, MasterCard, Amex, Discover) | Full Redaction | `[REDACTED_VISA]`, `[REDACTED_MASTERCARD]` |
| Project Keywords | Full Redaction | `[REDACTED_KEYWORD]` |
| Credential Pairs | Full Redaction | `[REDACTED_CREDENTIAL_PAIR]` |

### Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `SANITIZATION_MODE` | Detection strictness: `strict` (0.90 threshold), `balanced` (0.75), `lenient` (0.50), or `audit` | `balanced` |
| `SENSITIVE_KEYWORDS` | Comma-separated list of project-sensitive keywords to redact | _(empty)_ |
| `SANITIZATION_ALLOWLIST` | Comma-separated list of strings to never redact | _(empty)_ |

### Audit & Observability

After each run, a sanitization report is written to `app-data/sanitization-report.json` containing:
- Timestamp and detection mode
- List of all redacted findings with type, original value, replacement, confidence, and position
- Original and sanitized text lengths

This enables manual review and continuous improvement of detection rules.

## Setup

1. Clone the repository
2. Install dependencies:
    ```bash
    npm install
    ```
3. Install `cliclick` for KakaoTalk automation (macOS only):
    ```bash
    brew install cliclick
    ```
4. Copy `.env.sample` to `.env` and fill in required values:
    ```env
    MS_TEAM_GROUP_NAME=Your Team Group Name
    ADDITIONAL_MS_TEAM_GROUP_NAME=Additional Team Group Name (optional)
    AI_ENGINE=CLAUDE, GEMINI, or COHERE
    # Data Sanitization
    SANITIZATION_MODE=balanced
    SENSITIVE_KEYWORDS=Project Titan,Acme Client
    SANITIZATION_ALLOWLIST=support@tmasolutions.com
    # Human Resources configuration
    HR_FIXED_PEOPLE=Name:Role:MaxEffort:Billable,Name:Role:MaxEffort:Billable
    HR_CONDITIONAL_PEOPLE=Name:Role:MaxEffort,Name:Role:MaxEffort
    # Reminder messages (JSON array)
    REMINDER_MESSAGES=["Message 1","Message 2",...]
    # Cohere (only when AI_ENGINE=COHERE)
    COHERE_API_KEY=your-cohere-trial-key
    COHERE_MODEL=command-a-03-2025
    # Email configuration
    EMAIL_USER=your-email@example.com
    EMAIL_PASS=your-app-password
    TO_RECIPIENTS="Name" <email@example.com>,"Name" <email2@example.com>
    CC_RECIPIENTS="Name" <email@example.com>
    ```
4. First-time setup: Run the application and complete any manual login steps when prompted
    ```bash
    npm start
    ```
    or
    ```bash
    node index.js
    ```

## Usage

### Via shell script (recommended)

```bash
./run.sh
```

This script:
- Loads `.env` safely (supports quoted values)
- Runs `index.js`
- Launches the KakaoTalk automation script (`src/services/kakao-talk.sh`)

Notify-only mode (send a random reminder to MS Teams without generating a report):
```bash
./run.sh --notify
```

### Direct Node.js

Run the report generation pipeline:
```bash
npm start
```

Or directly:
```bash
node index.js
```

Notify mode:
```bash
node index.js --notify
```

The application will:
1. Launch browser windows for Teams and AI interaction
2. Prompt for manual login if needed (only first time)
3. Scrape messages from Teams
4. Sanitize sensitive data from messages
5. Generate AI report
6. Send report via email
7. Close browsers and exit

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `MS_TEAM_GROUP_NAME` | Primary Microsoft Teams group to scrape | Yes |
| `ADDITIONAL_MS_TEAM_GROUP_NAME` | Additional Teams group to scrape (optional) | No |
| `AI_ENGINE` | AI engine to use: `CLAUDE`, `GEMINI`, or `COHERE` | Yes |
| `COHERE_API_KEY` | Cohere API key, required when `AI_ENGINE=COHERE` (trial key: 1,000 calls/month, 20 req/min) | Only for `COHERE` |
| `COHERE_MODEL` | Cohere model name (default: `command-a-03-2025`) | No |
| `MAX_CHAT_SCROLL_UP` | Maximum scroll ups to load messages (default: 5) | No |
| `PLAYWRIGHT_SLOWMO` | Slow down Playwright actions (ms, default: 300) | No |
| `HR_FIXED_PEOPLE` | Fixed HR people, format: `Name:Role:MaxEffort:Billable` (comma-separated, Billable = Yes or No) | No |
| `HR_CONDITIONAL_PEOPLE` | Conditional HR people, format: `Name:Role:MaxEffort` (comma-separated) | No |
| `REMINDER_MESSAGES` | JSON array of random reminder messages for MS Teams notify mode | No |
| `EMAIL_USER` | Email username for sending reports | Yes |
| `EMAIL_PASS` | Email password/app password | Yes |
| `EMAIL_TO` | Recipient email address | Yes |
| `SANITIZATION_MODE` | Sanitization strictness: `strict`, `balanced`, `lenient`, or `audit` (default: `balanced`) | No |
| `SENSITIVE_KEYWORDS` | Comma-separated project-sensitive keywords to redact | No |
| `SANITIZATION_ALLOWLIST` | Comma-separated strings to never redact | No |

## Dependencies

- **Playwright**: Browser automation for Teams and AI interaction
- **Dotenv**: Environment variable loading
- **Nodemailer**: Email sending functionality
- **Axios**: HTTP client, used by the Cohere service
- **cliclick**: Command-line mouse click tool for KakaoTalk automation (macOS only)

## How It Works

### Microsoft Teams Scraping (`ms-team.js`)
- Uses Playwright with persistent browser context to maintain login sessions
- Navigates to Teams, handles login if required
- Scrapes messages from specified group(s) for the latest calendar day
- Saves messages as both JSON and text files

### Data Sanitization (`src/utils/sanitize.js`)
- Runs immediately after Teams scraping and before prompt construction
- Uses hybrid detection: **regex patterns** for known secret formats + **Shannon entropy** for arbitrary-format secrets
- Redacts 30+ sensitive data types including PII, account information, API keys, tokens, credentials, and project keywords
- Writes an audit report to `app-data/sanitization-report.json` for review
- Supports configurable modes (`strict`, `balanced`, `lenient`) and allowlists

### Prompt Building (`src/templates/prompt-template.js`)
- Reads static prompt text from `prompt.txt` with `{{PLACEHOLDER}}` tokens
- Injects dynamic values: company name, HR config (from `.env`), CSS brand spec (`brand.css`), and HTML artifact template (`artifact-template.html`)
- Creates structured prompts for AI report generation

### AI Processing (`claude.js`/`gemini.js`/`cohere.js`)
- Claude and Gemini launch persistent browser contexts for the AI platforms
- Submits prompts and waits for response completion
- For Claude: Waits for artifact generation and downloads HTML
- For Gemini: Extracts generated text and saves as HTML
- For Cohere: Calls the v2 Chat API over HTTPS (no browser) and writes the returned HTML directly

### Cohere Service (`src/services/cohere.js`)
- `generateHtml(prompt, options?)` returns the generated HTML as a string
- `sendToCohereAndSave(prompt, outputPath, options?)` also writes the HTML to disk
- Options: `model`, `temperature` (0.3), `maxTokens` (8192), `systemPrompt`, `preamble`
- Throws on a missing key, an empty prompt, an empty response, or a failed request
- See [Cohere free API limitations](#cohere-freetrial-api-limitations) before relying on a trial key

### Email Delivery (`send-mail.js`)
- Uses Nodemailer to send HTML reports as email attachments
- Configurable recipient, subject, and sender

## Testing

Run the sanitization test suite:
```bash
npm test
```

Run the Cohere service test (requires `COHERE_API_KEY`, makes two live API calls):
```bash
node src/tests/cohere-test.js
```

## Notes

- First-time execution requires manual login to Teams and possibly AI platforms
- Subsequent runs use saved browser sessions for automatic login
- The system is designed to run daily to generate reports from the previous day's messages
- AI platforms may require manual interaction only on first use (to handle any CAPTCHA or login prompts)
- Generated reports are saved in `app-data/` with date-based filenames
- Sanitization reports are saved in `app-data/sanitization-report.json` for audit purposes

## Troubleshooting

- If login prompts appear, follow console instructions to complete them manually
- Check console output for detailed progress information
- Screenshots are saved to `app-data/` when certain errors occur (e.g., missing download buttons)
- Ensure Playwright browsers are installed: `npx playwright install`
- Review `app-data/sanitization-report.json` to verify redactions and tune allowlists/keywords
- `AI_ENGINE=COHERE` errors: `COHERE_API_KEY is not set` means the key is missing from `.env`; `429 Too Many Requests` means the trial limits (1,000 calls/month, 20 requests/min) were hit — check the [Cohere dashboard](https://dashboard.cohere.com) usage or switch to another engine

## License

ISC License

## Author

AI Report Generator - Automated Teams message processing and reporting system

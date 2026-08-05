# AI Report Generator

An automated system that scrapes messages from Microsoft Teams, processes them with AI (Claude or Gemini), generates HTML reports, and sends them via email.

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
│   │   └── send-mail.js      # Email sending functionality
│   ├── templates/            # Template processing
│   │   ├── prompt-template.js # Prompt builder for AI
│   │   ├── prompt.txt         # Static prompt text with placeholders
│   │   ├── brand.css          # Company brand CSS spec
│   │   └── artifact-template.html # HTML artifact template
│   ├── utils/                # Utility functions
│   │   └── index.js          # Date extraction, report title generation, browser cleanup
│   └── tests/                # Test files
│       ├── test-utils.js
│       ├── test-gemini.js
│       └── test-mail.js
├── app-data/                 # Data storage (messages, prompts, reports)
│   ├── messages.json         # Scraped Teams messages in JSON format
│   ├── messages.txt          # Scraped Teams messages in text format
│   ├── prompt_sent.txt       # Last prompt sent to AI
│   └── report_*.html         # Generated HTML reports
└── teams-profile/            # Persistent browser profile for Teams
```

## Features

- **Microsoft Teams Integration**: Automatically logs into Teams (saves session for future runs) and scrapes messages from specified groups
- **AI Processing**: Sends scraped messages to either Claude AI or Gemini AI for report generation
- **Report Generation**: Creates professional HTML reports with TMA Solutions branding
- **Email Delivery**: Sends generated reports via email using Nodemailer
- **Persistent Sessions**: Maintains login sessions to avoid repeated authentication
- **Configurable**: Easily switch between AI engines via environment variables

## Pipeline

1. **Scrape Messages**: Extract today's messages from Microsoft Teams using Playwright
2. **Extract Date**: Get the last date from messages.json for report naming
3. **Build Prompt**: Create a prompt with fixed TMA Solutions branding + dynamic categories
4. **AI Generation**: Send prompt to Claude or Gemini, wait for HTML artifact generation
5. **Email Report**: Send the generated HTML report via email

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.sample` to `.env` and fill in required values:
    ```env
    MS_TEAM_GROUP_NAME=Your Team Group Name
    ADDITIONAL_MS_TEAM_GROUP_NAME=Additional Team Group Name (optional)
    AI_ENGINE=CLAUDE or GEMINI
    # Human Resources configuration
    HR_FIXED_PEOPLE=Name:Role:MaxEffort,Name:Role:MaxEffort
    HR_CONDITIONAL_PEOPLE=Name:Role:MaxEffort,Name:Role:MaxEffort
    # Email configuration
    EMAIL_USER=your-email@example.com
    EMAIL_PASS=your-app-password
    EMAIL_TO=recipient@example.com
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

Run the report generation pipeline:
```bash
npm start
```

Or directly:
```bash
node index.js
```

The application will:
1. Launch browser windows for Teams and AI interaction
2. Prompt for manual login if needed (only first time)
3. Scrape messages from Teams
4. Generate AI report
5. Send report via email
6. Close browsers and exit

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `MS_TEAM_GROUP_NAME` | Primary Microsoft Teams group to scrape | Yes |
| `ADDITIONAL_MS_TEAM_GROUP_NAME` | Additional Teams group to scrape (optional) | No |
| `AI_ENGINE` | AI engine to use: `CLAUDE` or `GEMINI` | Yes |
| `MAX_CHAT_SCROLL_UP` | Maximum scroll ups to load messages (default: 10) | No |
| `PLAYWRIGHT_SLOWMO` | Slow down Playwright actions (ms, default: 300) | No |
| `HR_FIXED_PEOPLE` | Fixed HR people (Billable=Yes), format: `Name:Role:MaxEffort` (comma-separated) | No |
| `HR_CONDITIONAL_PEOPLE` | Conditional HR people, format: `Name:Role:MaxEffort` (comma-separated) | No |
| `EMAIL_USER` | Email username for sending reports | Yes |
| `EMAIL_PASS` | Email password/app password | Yes |
| `EMAIL_TO` | Recipient email address | Yes |

## Dependencies

- **Playwright**: Browser automation for Teams and AI interaction
- **Dotenv**: Environment variable loading
- **Nodemailer**: Email sending functionality
- **Axios**: HTTP client (included but may not be actively used)

## How It Works

### Microsoft Teams Scraping (`ms-team.js`)
- Uses Playwright with persistent browser context to maintain login sessions
- Navigates to Teams, handles login if required
- Scrapes messages from specified group(s) for the latest calendar day
- Saves messages as both JSON and text files

### Prompt Building (`src/templates/prompt-template.js`)
- Reads static prompt text from `prompt.txt` with `{{PLACEHOLDER}}` tokens
- Injects dynamic values: company name, HR config (from `.env`), CSS brand spec (`brand.css`), and HTML artifact template (`artifact-template.html`)
- Creates structured prompts for AI report generation

### AI Processing (`claude.js`/`gemini.js`)
- Launches persistent browser contexts for AI platforms
- Submits prompts and waits for response completion
- For Claude: Waits for artifact generation and downloads HTML
- For Gemini: Extracts generated text and saves as HTML

### Email Delivery (`send-mail.js`)
- Uses Nodemailer to send HTML reports as email attachments
- Configurable recipient, subject, and sender

## Notes

- First-time execution requires manual login to Teams and possibly AI platforms
- Subsequent runs use saved browser sessions for automatic login
- The system is designed to run daily to generate reports from the previous day's messages
- AI platforms may require manual interaction only on first use (to handle any CAPTCHA or login prompts)
- Generated reports are saved in `app-data/` with date-based filenames

## Troubleshooting

- If login prompts appear, follow console instructions to complete them manually
- Check console output for detailed progress information
- Screenshots are saved to `app-data/` when certain errors occur (e.g., missing download buttons)
- Ensure Playwright browsers are installed: `npx playwright install`

## License

ISC License

## Author

AI Report Generator - Automated Teams message processing and reporting system
# outreach

LLM-powered outreach message generation + mail merge, deployed as a Google Apps Script add-on to Google Sheets via CLASP.

---

## Prerequisites

- Node.js ≥ 18
- `clasp` installed globally or as a dev dependency (`npx clasp`)
- A Google account with access to the target Google Sheet

---

## First-time setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create personal config files (gitignored)

```bash
cp src/config/profile.template.ts src/config/profile.ts
cp src/config/messages.template.ts src/config/messages.ts
```

Fill in `profile.ts` with your real values (email, phone, resume URL, Calendly URL, blurb).
Fill in `messages.ts` with your personal outreach message templates.

These files are gitignored and will never be committed.

### 3. Log in to CLASP

```bash
npx clasp login
```

This opens a browser OAuth flow and writes credentials to `~/.clasprc.json`.

### 4. Link to an existing GAS project or create a new one

**Link to an existing project** (recommended — use your current sheet's script ID):

```bash
npx clasp clone <scriptId> --rootDir dist
```

This creates `.clasp.json` in the project root. Move it here if needed:

```bash
mv dist/.clasp.json .
```

**Or create a new standalone GAS project:**

```bash
npx clasp create --type sheets --title "Outreach" --rootDir dist
```

Either way, `.clasp.json` is gitignored — it contains your personal script ID.

To find your script ID: open the Google Sheet → Extensions → Apps Script → Project Settings → Script ID.

### 5. Set Script Properties

In the GAS editor (Extensions → Apps Script → Project Settings → Script Properties), add:

| Key | Value |
|-----|-------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `SENDGRID_API_KEY` | Your SendGrid API key (create a new one — never use old keys) |
| `MY_EMAIL` | Your sending email address |
| `MY_PHONE` | Your phone number (for SMS warmup) |
| `NGROK_SMS_URL` | Your ngrok tunnel URL (optional, only if using SMS) |

---

## Development workflow

```bash
# Type check
npm run type-check

# Lint
npm run lint

# Run tests
npm run test

# Build only (webpack → dist/Code.js)
npm run build

# Build + deploy to GAS
npm run deploy

# Watch mode (rebuilds on save, no push)
npm run watch

# Open the GAS editor in browser
npm run clasp:open
```

---

## Project structure

```
src/
├── config/
│   ├── settings.ts          # Script Property key constants, column/sheet names, flags
│   ├── profile.ts           # YOUR data: email, phone, resume URL, blurb (gitignored)
│   ├── profile.template.ts  # Committed reference shape for profile.ts
│   ├── messages.ts          # YOUR content: outreach message template functions (gitignored)
│   └── messages.template.ts # Committed reference shape for messages.ts
├── services/
│   ├── message-generator.ts # LLM outreach generation via Anthropic API
│   ├── gmail.ts             # Mail merge via Gmail drafts
│   ├── sendgrid.ts          # Transactional email via SendGrid
│   ├── sms.ts               # SMS via ngrok tunnel
│   └── contacts.ts          # Google People API contact lookups
├── ui/
│   └── menu.ts              # onOpen() — installs "Utils" menu in the sheet
└── index.ts                 # GAS entry point — all global function exports
```

---

## Sheet column conventions

The mail merge (`sendEmails`) expects these header columns:

| Column | Purpose |
|--------|---------|
| `Recipient` | Email address to send to |
| `First` | Contact first name |
| `Cell` | Phone number (SMS only) |
| `Email Sent` | Timestamp written after send (blank = not yet sent) |
| `Subject` | Subject override (only used in A/B test mode) |

The `generateMessageForRow` function expects:

| Column | Value |
|--------|-------|
| A | Contact name |
| B | Contact role/title |
| C | Company |
| D | Job title you're targeting |
| E | Notes / context |
| F | ← Subject written here |
| G | ← Body written here |

---

## Gmail draft templates

`sendEmails` looks up a Gmail draft by subject line and uses it as the template. Supported template tokens:

```
{{First}}            contact first name (from sheet row)
{{Valediction}}      day-appropriate sign-off (Mon→"great week!", Fri→"great weekend!")
{{Ideal}}            ideal role description
{{Accomplishment1}}  KEY_ACCOMPLISHMENTS[0]  (through {{Accomplishment4}})
{{AboutMe}}          aboutMe() message
{{Who}}              who() positioning statement
{{CMF}}              candidate market fit summary
{{Ask}}              ask() CTA
{{Blurb}}            profile blurb[0]
{{Connection}}       connection request message (uses PersonName + PersonURL columns)
{{Intro}}            intro message (uses PersonName + JobTitleActual + Blurb columns)
{{Followup}}         followup() message
{{Reciprocate}}      reciprocate() message
{{WhatAndWhere}}     whatAndWhere() message
{{Why}}              why() message
{{Get}} / {{Give}}   aliases for {{Ask}} / {{Reciprocate}}
```

Any other `{{ColumnName}}` token is replaced with the value from that column in the sheet row.

---

## Security notes

- **Never commit `profile.ts` or `messages.ts`** — they contain personal data and are gitignored.
- **Never hardcode API keys** — all credentials live in GAS Script Properties only.
- If you ever accidentally commit a credential, revoke it immediately, then remove it from git history with `git filter-repo`.
- `.clasp.json` is gitignored — it contains your personal GAS script ID.

# career-catalyst-apply

Automated job application form filling using [Stagehand](https://github.com/browserbase/stagehand) browser automation. Integrates with the core career-catalyst toolkit — automatically pulling in your tailored resume, cover letter, and interview prep statements to fill out online application forms.

## How It Works

1. Navigates to the application URL in a local browser window
2. Extracts all form fields (text inputs, dropdowns, textareas)
3. Fills fields intelligently:
   - Personal info (name, email, phone, LinkedIn, GitHub) parsed from `cv.txt`
   - Cover letter / motivation fields → pulled from cached interview prep output
   - About-me / biography fields → pulled from cached interview prep output
   - Experience / STAR-method questions → generated via OpenAI from CV + resume
   - All other fields → AI-generated via OpenAI with field context
4. Prompts you to review in the browser before submitting
5. Optionally submits and verifies via HTTP 200 response + page content detection

Field values from each run are cached in `logs/<jobId>/application-*.json` and reused on subsequent runs.

## Prerequisites

- Node.js 18+
- Chromium (installed by Stagehand automatically on first run)
- `cv.txt` in the project root
- A job ID with at least a tailored resume generated (`npm run dev resume <jobId>`)
- Environment variables configured (see `.env.example`)

### Required env vars

```
OPENAI_API_KEY=...        # Used for field value generation
ANTHROPIC_API_KEY=...     # Used by core agents (resume, interview prep)
```

### Optional Stagehand env vars

Stagehand runs in `LOCAL` mode by default (your local Chromium). If you want to use [Browserbase](https://browserbase.com) cloud browsers instead, set:

```
BROWSERBASE_PROJECT_ID=...
BROWSERBASE_API_KEY=...
```

Then change `env: 'LOCAL'` → `env: 'BROWSERBASE'` in `src/agent.ts`.

## Usage

```bash
# Standard application fill
npm run apply -- apply <jobId> <applicationUrl>

# Inspect the form structure without filling (dry run)
npm run apply -- apply <jobId> <applicationUrl> --dry-run

# Skip auto-generation of missing interview prep statements
npm run apply -- apply <jobId> <applicationUrl> --skip
```

### Options

| Flag | Description |
|------|-------------|
| `--dry-run` | Opens the form in a browser for inspection only. No fields are filled, nothing is submitted. Useful for scoping a complex form before a real run. |
| `--skip` | Skips auto-generation of cover letter / about-me if they don't already exist. Some fields may be left blank. |

## Field Caching

After each run, all filled field values are saved to `logs/<jobId>/application-<timestamp>.json`. On the next run for the same job, those cached values are reused automatically — skipping AI generation for fields that already have values. This makes repeat applications (e.g. after a form error) much faster.

To force fresh generation, delete the `application-*.json` files in `logs/<jobId>/`.

## Integration with Core Agents

This component depends on `@inkredabull/career-catalyst-core` and uses the following agents at runtime:

| Agent | Purpose |
|-------|---------|
| `ResumeCreatorAgent` | Auto-generates a tailored resume if none exists for the job |
| `InterviewPrepAgent` | Auto-generates cover letter + about-me statements if missing |
| `OutreachAgent` | Opens LinkedIn connections page alongside the form (networking while applying) |

## Output

```
logs/<jobId>/
  application-<timestamp>.json    # Filled fields + form metadata
```

## Architecture

```
components/apply/
  src/
    agent.ts     ApplicationAgent — Stagehand orchestration + field filling logic
    cli.ts       Commander.js CLI entry point
    types.ts     ApplicationFormField, ApplicationFormData, ApplicationResult
    index.ts     Public exports
  package.json
  tsconfig.json
  README.md
```

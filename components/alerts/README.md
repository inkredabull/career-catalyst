# alerts

Google Apps Script component that searches LinkedIn for new job postings by title and geography, then emails a digest of results.

Runs on a GAS time-based trigger (e.g. every 8 hours). No browser required once deployed.

---

## How it works

1. For each title in `TITLES` × each geo filter (SF, US), calls the LinkedIn Voyager job-search API
2. Filters out excluded companies and software-engineer roles
3. De-duplicates results by job ID across all searches
4. Emails the digest to `MY_EMAIL`

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Link to the Google Sheet / Script

```bash
npx clasp clone <scriptId> --rootDir dist
```

`.clasp.json` is gitignored — create it per machine.

### 3. Set Script Properties

In the GAS editor: **Project Settings → Script Properties**, add:

| Key | Value |
|---|---|
| `MY_EMAIL` | Your email address for the digest |
| `LI_COOKIE` | Full LinkedIn session cookie string (from browser DevTools) |
| `LI_CSRF_TOKEN` | LinkedIn CSRF token, e.g. `ajax:5203108709841703172` |

**To get LinkedIn credentials:**
1. Open LinkedIn in Chrome, go to Jobs search
2. DevTools → Network → any `voyagerJobsDashJobCards` request
3. Copy the full `cookie` header value → `LI_COOKIE`
4. Copy the `csrf-token` header value → `LI_CSRF_TOKEN`

> LinkedIn sessions expire. Rotate credentials when you see auth errors in GAS execution logs.

### 4. Build and deploy

```bash
npm run deploy
```

### 5. Set a time trigger

In the GAS editor: **Triggers → Add Trigger**
- Function: `getOpenReqs`
- Event source: Time-driven
- Type: Hours timer, every 8 hours (or as preferred)

---

## Customisation

**Add/remove job titles** — edit `TITLES` in [src/config/constants.ts](src/config/constants.ts)

**Change time window** — change `TIME_FRAME` in `constants.ts` (`ONE_DAY`, `ONE_WEEK`, `EIGHT_HOURS`)

**Exclude companies** — add to `COMPANIES_TO_EXCLUDE` in `constants.ts`

**Change geo** — adjust `SF_FILTER` / `US_FILTER` or add new filter objects and reference them in `index.ts`

---

## Project structure

```
src/
├── config/
│   ├── settings.ts    # Script Property keys, requireProp helper
│   └── constants.ts   # Geo IDs, filters, titles, excluded companies
├── clock.ts           # pause() with jitter to avoid rate limits
├── linkedin.ts        # Voyager API calls, URL builder, result extractor
└── index.ts           # Orchestration: getResults(), notify(), getOpenReqs()
```

---

## PII / secrets policy

Nothing sensitive is committed. Credentials live in GAS Script Properties only:

- `MY_EMAIL` — recipient address
- `LI_COOKIE` — LinkedIn session (rotates; treat as a secret)
- `LI_CSRF_TOKEN` — LinkedIn CSRF token

`dist/`, `node_modules/`, and `.clasp.json` are gitignored.

## Reference

Set SEARCH_TIME_FRAME in Script Properties to one of:

r28800 — 8 hours
r86400 — 24 hours
r604800 — 7 days

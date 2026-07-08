# career-catalyst-alerts

Vercel-hosted job alert system that searches LinkedIn and Google (via Serper) for new job postings, scores each one with Claude AI, and emails a digest using Resend.

Runs on a Vercel cron schedule (every 4 hours). No manual intervention required once deployed.

---

## Architecture

```
Vercel Cron (every 4h)
        │
        ▼
   getOpenReqs()
        │
        ├─── LinkedIn Voyager API  ─┐
        ├─── Google/Serper API     ─┼─► merge & de-dup by job ID
        └─── LinkedIn Top Applicant─┘
                   │
                   ▼
           filterUnseen()  ◄── GCS: seen.json
                   │
                   ▼
            applyStopList() ◄── GCS: stop-lists.json
                   │
                   ▼
            scoreJob() ──► Jina Reader → ScrapingBee (fallback)
                           Claude Sonnet (14-dimension rubric)
                           GCS: score blobs (id → reasoning)
                   │
                   ▼
            notify() ──► Resend email digest
                         • Grouped by geo (Top Applicant / SF Bay Area / Remote US / Other)
                         • 🟢/🟡 jobs with "Why?" score links
                         • Collapsible 🔴 Pass section
                         • Collapsible run log
                   │
                   ▼
            saveSeen() ──► GCS: seen.json
```

### Search sources

| Label | Source | Scope |
|---|---|---|
| LinkedIn SF/US | LinkedIn Voyager API | SF Bay Area + US Remote |
| Top Applicant | LinkedIn Top Applicant feed | US |
| Ashby/SF | Serper `site:jobs.ashbyhq.com` | San Francisco |
| Wellfound/SF | Serper `site:wellfound.com` | San Francisco |
| Indeed/SF | Serper `site:indeed.com` | SF Bay Area / Remote |
| Anthropic/SF | Serper `site:anthropic.com/jobs` | San Francisco |
| Greenhouse/US | Serper `site:boards.greenhouse.io` | US |
| Lever/US | Serper `site:jobs.lever.co` | US |
| BuiltInSF/SF | Serper `site:builtinsf.com/jobs` | San Francisco |
| Web/US | Serper broad web search | US |

### Scoring

Each new job is scored by Claude Sonnet against a 14-dimension rubric (skills alignment, compensation, remote-friendliness, culture, etc.). The score and reasoning are saved to GCS so the email's "Why?" links serve them on demand via `/api/score`.

JD text is fetched via **Jina Reader** (`r.jina.ai`) with **ScrapingBee** as an automatic fallback when LinkedIn blocks the Jina request.

### Email digest

Jobs are grouped by geography and color-coded by verdict:
- 🟢 Strong Fit — Pursue Actively
- 🟡 Conditional Fit — Dig Deeper Before Committing
- 🔴 Pass — collapsed at bottom with "Why?" links

Each entry includes block buttons (👎 company / 👎 title) that hit `/api/block`, and a Track link for the JD extractor.

---

## Technologies

| Layer | Tool |
|---|---|
| Runtime | Vercel Functions (Node.js) |
| Schedule | Vercel Cron |
| LinkedIn data | LinkedIn Voyager API (session cookie auth) |
| Google search | Serper API |
| JD fetching | Jina Reader + ScrapingBee fallback |
| AI scoring | Anthropic Claude Sonnet (`claude-sonnet-4-6`) |
| Storage | Google Cloud Storage (seen.json, stop-lists, score blobs) |
| Email | Resend |
| Language | TypeScript (strict) |
| Tests | Jest (104 tests) |

---

## Project structure

```
src/
├── config/
│   ├── settings.ts      # ENV key constants, requireEnv helper
│   ├── constants.ts     # Geo IDs, LinkedIn filters, time frames, thresholds
│   └── titles.ts        # Job title search list (enabled/disabled map)
├── utils/
│   └── logger.ts        # Level-based logger; verbosity via LOG_LEVEL env var
├── clock.ts             # pause() with jitter to avoid rate limits
├── filters.ts           # titlePassesPatterns() — regex pattern matching
├── linkedin.ts          # Voyager API calls, Top Applicant feed, result extractor
├── google.ts            # Serper API calls, title parser, GOOGLE_SEARCHES list
├── scoring.ts           # Claude scoring: fetchJD (Jina+ScrapingBee), scoreJob()
├── seen.ts              # GCS read/write: seen.json, stop-lists, score blobs
├── notify.ts            # Email builder and Resend send: formatEntry(), notify()
└── index.ts             # Orchestration: getResults(), getOpenReqs()
api/
├── cron.ts              # POST /api/cron — Vercel cron entry point
├── block.ts             # GET /api/block?type=company|title&value=... — stop-list writer
└── score.ts             # GET /api/score?id=... — serves stored scoring reasoning
```

---

## Environment variables

| Variable | Description |
|---|---|
| `MY_EMAIL` | Digest recipient address |
| `LI_COOKIE` | LinkedIn session cookie (from browser DevTools) |
| `LI_CSRF_TOKEN` | LinkedIn CSRF token (`ajax:...`) |
| `SERPER_API_KEY` | Serper API key for Google searches |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude scoring |
| `SCRAPINGBEE_API_KEY` | ScrapingBee API key (JD fetch fallback) |
| `RESEND_API_KEY` | Resend API key for email delivery |
| `GCS_BUCKET` | GCS bucket name for seen/stop-list/score storage |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | GCS service account JSON (stringified) |
| `CRON_SECRET` | Bearer token Vercel sends with cron requests |
| `WEB_APP_URL` | Base URL of this Vercel app (for block/score links in email) |
| `TRACK_BASE_URL` | Base URL of the JD extractor service |
| `LOG_LEVEL` | `DEBUG` / `INFO` / `WARN` (default: `INFO`) |
| `SEARCH_TIME_FRAME` | Override time window: `r28800` / `r86400` / `r604800` |

Store all secrets in Vercel project environment variables (production + preview). For local dev, copy to `.env.local`.

**To get LinkedIn credentials:**
1. Open LinkedIn in Chrome, go to Jobs search
2. DevTools → Network → any `voyagerJobsDashJobCards` request
3. Copy the full `cookie` header value → `LI_COOKIE`
4. Copy the `csrf-token` header value → `LI_CSRF_TOKEN`

> LinkedIn sessions expire. Rotate credentials when you see 401/403 errors in Vercel logs.

---

## Local development

```bash
npm install
npm run type-check   # tsc --noEmit
npm test             # jest (104 tests)
npm run lint         # eslint src api
```

To run a one-off cron locally, set env vars in `.env.local` and hit the cron endpoint via `vercel dev`.

---

## Customisation

**Add/remove job titles** — edit `SEARCH_TITLES` in [src/config/titles.ts](src/config/titles.ts) (set `true`/`false`)

**Add a search source** — append to `GOOGLE_SEARCHES` in [src/google.ts](src/google.ts); add the site name to `NOISE_SEGMENTS`; add a geo routing clause in `geoLabel()` in [src/notify.ts](src/notify.ts)

**Change time window** — set `SEARCH_TIME_FRAME` env var or change `TIME_FRAME` in `constants.ts`

**Block a company/title** — use the 👎 links in the email, or hit `/api/block?type=company&value=Acme` directly

**Adjust scoring thresholds** — `STRONG_FIT_MAX_APPLICANTS` and `APPLICANT_SATURATION_THRESHOLD` in `constants.ts`

# career-catalyst-alerts

Vercel-hosted job alert system that searches LinkedIn, target companies' ATS boards, and the open web (via Exa) for new job postings, scores each one with Claude AI, and emails a digest using Resend.

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
        ├─── ATS board APIs        ─┼─► merge & de-dup by job ID
        ├─── Exa discovery (8h)    ─┤
        └─── LinkedIn Top Applicant─┘
                   │
                   ▼
           filterUnseen()  ◄── GCS: seen.json
                   │
                   ▼
            applyStopList() ◄── GCS: stop-lists.json
                   │
                   ▼
            scoreJob() ──► LinkedIn: Voyager API / else: Jina Reader
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
| Target/{Company} | The company's own ATS board API | US / Bay Area |
| Ashby/SF | Exa `jobs.ashbyhq.com` | San Francisco |
| Wellfound/SF | Exa `wellfound.com` | San Francisco |
| BuiltInSF/SF | Exa `builtinsf.com` (path `/job/`) | San Francisco |
| Greenhouse/US | Exa `job-boards.greenhouse.io` | US |
| Lever/US | Exa `jobs.lever.co` | US |
| Levels/US | Exa `levels.fyi` (path `/jobs`) | US |
| YC/US | Exa `ycombinator.com` (path `/companies/`) | US |
| Web, US | Exa broad web search | US |

The ATS layer runs on every cron tick because board APIs are free. The Exa
layer runs every 8h (3 of the 6 ticks) — roughly $5/month against Exa's $10
monthly free credit. A per-run cost ceiling stops the run rather than letting
it silently exhaust the balance, which is how the previous Serper integration
failed. Indeed was dropped: Exa only indexes its search-listing pages, not
individual postings.

#### Watching a specific company

Add it to `COMPANY_TARGETS` in `src/config/boards.ts`. Those entries are polled
straight from the company's ATS (Greenhouse, Lever, or Ashby), which is free and
unmetered — so unlike a search slot, each extra company costs nothing per run —
and returns a real title, location and publish date instead of a parsed page
title. Verify the board token responds before committing it; companies migrate
between ATS vendors without changing their careers URL.

ATS results are filtered to US/Bay Area locations (`src/ats/location.ts`), since
a board API returns a company's entire global req list.

### Scoring

Each new job is scored by Claude Sonnet against a 14-dimension rubric (skills alignment, compensation, remote-friendliness, culture, etc.). The score and reasoning are saved to GCS so the email's "Why?" links serve them on demand via `/api/score`.

JD text for LinkedIn postings comes from the **Voyager API**, reusing the session cookie the search already needs. LinkedIn blocks Jina at the site level and a paid Reader key does not change that, so the alternative was a third-party scraper — whose free tier is a fixed credit pool, after which every score silently degrades to title-only. Everything else (ATS boards, discovery results) is fetched via **Jina Reader** (`r.jina.ai`).

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
| Discovery search | Exa API |
| Company job boards | Greenhouse / Lever / Ashby public APIs |
| JD fetching | LinkedIn Voyager API + Jina Reader |
| AI scoring | Anthropic Claude Haiku (`claude-haiku-4-5`) |
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
│   ├── boards.ts        # COMPANY_TARGETS — companies polled via their ATS
│   └── titles.ts        # Job title search list (enabled/disabled map)
├── ats/
│   ├── index.ts         # fetchAtsResults() — polls every COMPANY_TARGETS board
│   ├── greenhouse.ts    # Greenhouse board API → AtsJob[] (pure)
│   ├── lever.ts         # Lever postings API → AtsJob[] (pure)
│   ├── ashby.ts         # Ashby posting API → AtsJob[] (pure)
│   ├── location.ts      # isUsOrBayArea() — geo allowlist for board results
│   └── types.ts         # AtsJob plus JSON-narrowing helpers
├── utils/
│   ├── logger.ts        # Level-based logger; verbosity via LOG_LEVEL env var
│   └── concurrency.ts   # withConcurrency() worker pool
├── clock.ts             # pause() with jitter; time-frame → cutoff helpers
├── filters.ts           # titlePassesPatterns() — regex pattern matching
├── linkedin.ts          # Voyager API calls, Top Applicant feed, result extractor
├── discovery.ts         # Exa search slots, page-title parser, cost ceiling
├── utils/text.ts        # normalizeWhitespace() — collapses U+00A0 from sources
├── scoring.ts           # Claude scoring: fetchJD (Voyager/Jina), scoreJob()
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
| `EXA_API_KEY` | Exa API key for discovery searches |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude scoring |
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

**Watch a specific company** — append to `COMPANY_TARGETS` in [src/config/boards.ts](src/config/boards.ts). Free and unmetered; verify the board token live first.

**Add a discovery source** — append to `DISCOVERY_SEARCHES` in [src/discovery.ts](src/discovery.ts); add the site name to `NOISE_SEGMENTS` so it isn't mistaken for the company; add a geo routing clause in `geoLabel()` in [src/notify.ts](src/notify.ts) and a case in [src/\_\_tests\_\_/boards.test.ts](src/__tests__/boards.test.ts), or the slot's jobs land silently in "Other". Each slot costs ~$0.007 per discovery run.

**Change time window** — set `SEARCH_TIME_FRAME` env var or change `TIME_FRAME` in `constants.ts`

**Block a company/title** — use the 👎 links in the email, or hit `/api/block?type=company&value=Acme` directly

**Adjust scoring thresholds** — `STRONG_FIT_MAX_APPLICANTS` and `APPLICANT_SATURATION_THRESHOLD` in `constants.ts`

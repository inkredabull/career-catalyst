# networker

Unified LinkedIn networking CLI — discovery, outreach, and lifecycle tracking.

Merges `meetup-networker` (profile lookup + Chrome automation) and `network-followups` (withdrawal/re-invite lifecycle) into a single tool with a local JSON tracker replacing the Google Sheets runtime that was never deployed.

---

## Setup

```bash
cd components/networker
npm install
cp .env.example .env
# Fill in ENRICHLAYER_API_TOKEN and ANTHROPIC_API_KEY at minimum
```

---

## Commands

### `discover` — find new contacts from a meetup name list

```bash
npm start discover "SF Codex Meetup on 4-28-26.csv"
npm start discover "SF Codex Meetup on 4-28-26.csv" --batch-size 12
```

Reads a plain-text file of names (one per line), looks each up via [EnrichLayer](https://enrichlayer.com), classifies by priority tier, and caches results in `logs/<event-slug>/`. Trims processed names from the file so subsequent runs handle the next batch.

If the file is empty, loads cached target contacts from a previous run instead.

**Tier classification** (configurable via env vars):

| Tier | Default match |
|------|---------------|
| T1 | Managing/General Partner, VC, Investor, C-suite |
| T2 | VP, Director, Head of, Founder |
| T3 | Custom pattern (empty by default) |

---

### `send` — open Chrome tabs and inject connect modals (new contacts)

```bash
npm start send "SF Codex Meetup on 4-28-26.csv" --send-tier tier_1
npm start send "SF Codex Meetup on 4-28-26.csv" --send-tier all --max-sends 10
```

Reads cached profiles from a previous `discover` run, opens each LinkedIn URL in a new Chrome tab, waits for pages to load, then injects JavaScript that clicks **Connect → Add a Note** and fills the personalized message. Review each tab and click Send manually.

Requires Chrome to be the frontmost application. Uses AppleScript + Chrome tab injection — no browser extension needed.

**Message template** (set in `.env`):
```
LINKEDIN_MESSAGE_TEMPLATE=Hi {{firstName}}, looking forward to connecting!
```
Tokens: `{{firstName}}`, `{{summary}}` (4-word OpenAI condensation), `{{event}}` (from filename).

---

### `review` — show contacts due for action

```bash
npm start review
```

Reads the tracker and prints two lists:

- **WITHDRAW** — contacts with status `INVITED` whose invite is >30 days old
- **RE-INVITE** — contacts with status `WITHDRAWN` or `REINVITED_1` whose 21-day LinkedIn cooldown has elapsed and who have attempts remaining

No changes are written. Use `mark-withdrawn` and `reinvite` to act on the output.

---

### `reinvite` — send re-invite connection requests

```bash
npm start reinvite
npm start reinvite --max-sends 5
npm start reinvite --dry-run
```

Reads re-invite candidates from the tracker (same logic as `review`), opens their LinkedIn URLs in Chrome, and injects connect modals pre-filled with the appropriate variant message. After each successful injection the tracker status is advanced (`WITHDRAWN → REINVITED_1 → REINVITED_2`).

`--dry-run` prints the candidate list and messages without opening Chrome.

---

### `mark-withdrawn` — record manual withdrawals

```bash
npm start mark-withdrawn 3,7,12
```

After manually withdrawing invitations on LinkedIn, mark the corresponding tracker IDs as `WITHDRAWN`. Sets `withdrawnDate` to today and calculates `nextEligibleDate` (+21 days).

Use `networker review` to find the IDs.

---

### `mark-complete` — close out a contact

```bash
npm start mark-complete 5
```

Sets status to `COMPLETE`. The contact will no longer appear in review output.

---

### `migrate` — one-time import of withdrawn_log.csv

```bash
npm start migrate path/to/withdrawn_log.csv
npm start migrate path/to/withdrawn_log.csv --dry-run
```

Imports the legacy `withdrawn_log.csv` from the Cowork project into the tracker JSON. Column mapping:

| CSV column | Tracker field |
|---|---|
| `name` | `name` |
| `profile_url` | `linkedInUrl` |
| `original_message` | `originalMessage` |
| `date_withdrawn` | `withdrawnDate` |
| `draft_message` | `variant1` |
| `title · company · category` | `notes` |
| `pending_send` | `WITHDRAWN` |
| `sent` | `COMPLETE` |

`nextEligibleDate` is calculated as `date_withdrawn + 21 days`. Duplicate URLs are skipped.

---

## Tracker

Contact lifecycle is stored in a local JSON file (default: `./data/tracker.json`, override with `NETWORKER_TRACKER_FILE` in `.env`).

```
INVITED → PENDING_WITHDRAWAL → WITHDRAWN → REINVITED_1 → REINVITED_2 → COMPLETE
```

| Status | Meaning |
|--------|---------|
| `INVITED` | Connection request sent, awaiting acceptance |
| `PENDING_WITHDRAWAL` | Flagged for manual withdrawal |
| `WITHDRAWN` | Invite withdrawn, cooldown in progress |
| `REINVITED_1` | First re-invite sent |
| `REINVITED_2` | Second re-invite sent (max attempts reached) |
| `COMPLETE` | No further action |

---

## Typical weekly workflow

```bash
# After a meetup
npm start discover "My Event on 4-28-26.csv"
npm start send    "My Event on 4-28-26.csv" --send-tier tier_1

# Monthly cadence
npm start review
# → manually withdraw stale invites on LinkedIn, then:
npm start mark-withdrawn 3,7,12
npm start reinvite
```

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ENRICHLAYER_API_TOKEN` | For `discover`/`send` | EnrichLayer API key |
| `ANTHROPIC_API_KEY` | For variant generation | Anthropic API key (starts with `sk-ant-`) |
| `OPENAI_API_KEY` | Optional | Condenses profile summaries to 4 words for message personalisation |
| `SEARCH_CITY` | Optional | City used in EnrichLayer search (default: `San Francisco`) |
| `LINKEDIN_MESSAGE_TEMPLATE` | Optional | Message template for new outreach (see `discover`) |
| `NETWORKER_TRACKER_FILE` | Optional | Path to tracker JSON (default: `./data/tracker.json`) |
| `TARGET_TIER_1_PATTERN` | Optional | Regex for T1 classification |
| `TARGET_TIER_2_PATTERN` | Optional | Regex for T2 classification |
| `TARGET_TIER_3_PATTERN` | Optional | Regex for T3 classification |

---

## Development

```bash
npm run dev          # tsx watch (live reload)
npm run type-check   # tsc --noEmit
npm test             # vitest run
npm run build        # compile to dist/
```

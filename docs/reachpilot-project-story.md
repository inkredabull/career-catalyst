# ReachPilot: Your Copilot for relationship upkeep

## Inspiration

Job search isn't only applications and résumés — it's relationships. For years I ran a **Morning Warmup** ritual: pick a handful of contacts, draft a check-in email, and ask for intros. The tooling existed (`mail-merge` in Career Catalyst), but the workflow didn't scale.

Every morning looked the same: **five random Google Contacts**, a static Gmail template (`"Catching up + a quick ask"`), and merge fields limited to name and email. No memory of who I'd warmed up last week. No signal from what someone actually posted. No quality check before the draft landed in my inbox.

I'm a hands-on engineering leader who lives in my network — mentors, founders, peers, recruiters. The problem wasn't motivation; it was **research tax**. Personal outreach that doesn't feel personal is worse than no outreach at all.

I wanted an agent that could do the unglamorous work — score who needs attention, find a real hook, write the draft, catch itself when the hook is weak — while keeping me in the loop to review and send. **ReachPilot** is that agent.

## What it does

ReachPilot replaces random touchbase emails with a **self-directing agent** that runs a daily **Plan → Act → Observe → Correct** loop:

1. **Plan** — Scores your contact pool (days since last warmup, relationship tier, enrichability) and picks the top N — not a random shuffle.
2. **Act** — Enriches each contact from live signals: blog RSS, Google Contacts notes, **EnrichLayer** LinkedIn profiles, Twitter handles — with automatic fallback when a source fails.
3. **Observe** — **Amazon Bedrock** (Haiku) generates personalized `{{Zeitgeisty}}` and `{{Personalization}}` tokens; Sonnet judges each draft for warmth, specificity, and "creepy factor."
4. **Correct** — Regenerates weak drafts with judge feedback, up to three iterations.
5. **Deliver** — Creates **Gmail drafts** (human-in-the-loop), logs results to a **Warmup History** sheet, and sends you a rich digest email summarizing hooks, confidence, and draft links.

Subject lines rotate through five A/B variants. Every run is auditable via a run spec JSON. Nothing auto-sends — you stay in control.

## How we built it

ReachPilot lives in the Career Catalyst monorepo as `components/warmup-agent/` — a Node/TypeScript agent that extends patterns already in the codebase (mail-merge, network-followups, networker).

**Architecture highlights:**

| Layer | Technology |
|-------|------------|
| Orchestration | **Buildkite** pipeline — lint, test, dry-run, deploy; `bedrock-summarize` plugin for CI self-correction on failure |
| Agent logic | Custom PARC orchestrator + curated tool registry (Zero-inspired, ~12 tools not 29K) |
| LLM | **Amazon Bedrock** — Haiku for generation, Sonnet for quality gate |
| Enrichment | **EnrichLayer** Person Profile API (LinkedIn), RSS fetcher, contact notes |
| State | Google Sheets "Warmup History" tab (20 columns: hooks, A/B variant, quality scores) |
| Delivery | Gmail API — draft creation + Morning digest email |
| Scoring | Weighted contact ranker mirroring existing mail-merge exclusion labels |

**Phased delivery:**

- **Phase 0** — Contact scorer, run planner, sheet schema, subject A/B, CLI (`plan`, `score`, `init-sheet`)
- **Phase 1** — Enrichment executor, Bedrock generator/judge, corrector loop, Gmail adapter, digest, full `run` command

22 unit tests. Offline dry-run mode for CI and hackathon demos without live AWS credentials.

```bash
npm run warmup:run -- \
  --contacts contacts.json \
  --sheet "$WARMUP_SHEET_URL"
```

## Challenges we ran into

**LinkedIn activity feeds don't exist for free.** We initially wanted "latest 5 posts" personalization. LinkedIn ToS and API restrictions make live feed scraping unreliable. We pivoted to **EnrichLayer profile enrichment** (headline, role, summary) plus blog RSS and cached notes — honest fallbacks when signals are thin.

**Proxycurl → EnrichLayer migration.** The enrichment API we planned around was acquired and sunset. We migrated to EnrichLayer's `/api/v2/profile` endpoint, aligned with the existing `networker` component, and renamed enrichment sources throughout the agent.

**The offline judge almost failed good drafts.** Dry-run testing exposed a scoring edge case: generic check-in fallbacks scored 69/100 against a 70 threshold — failing John and Taylor despite reasonable copy. We fixed the heuristic and added LinkedIn-URL-only fallback signals.

**GAS limits vs. agent loops.** The original Morning Warmup lived in Google Apps Script — fine for drafts, poor for multi-step LLM loops. We moved orchestration to Node/Buildkite while keeping Gmail and Sheets as adapters.

**Sponsor tool wiring in CI.** Buildkite runs the full plan cycle in dry-run; live Bedrock + Gmail require AWS creds and OAuth scopes (`gmail.compose` beyond readonly). We documented the path and built offline mode so demos never block on credentials.

## Accomplishments that we're proud of

- Turned a **manual, random, amnesiac** email routine into an **autonomous, scored, self-correcting** agent — without removing human send approval.
- Shipped a **full PARC loop** in a weekend: not a chatbot wrapper, but plan spec → enrichment → generation → quality gate → retry → deliver.
- **Reused and connected** existing Career Catalyst pieces instead of greenfielding — mail-merge templates, network-followups sheet patterns, networker's EnrichLayer client.
- Built **auditable runs** — every contact gets a hook type, confidence score, judge feedback, and iteration count. You can explain *why* the agent picked someone and *what* it referenced.
- **22 tests passing**, Buildkite pipeline live, dry-run produces 4/4 drafts from the sample fixture after iteration on judge logic.

## What we learned

**Autonomy isn't auto-send.** The best outreach agents keep humans at the send button but remove the research and first-draft grind. Drafts + digest email is the right contract.

**Enrichment beats generation.** The LLM is only as good as its signals. Investing in source priority (RSS → notes → EnrichLayer → Twitter) and fallback chains mattered more than prompt tuning.

**Self-correction needs measurable gates.** "Regenerate until good" is vague; a Sonnet judge with a numeric threshold and explicit creepy-check makes the loop real and demo-able.

**Curated tool registries beat marketplaces.** Zero.xyz's insight — discover tools on demand — is powerful at scale. For a daily 5-contact job, ~12 known tools with health tracking is simpler and debuggable.

**Hackathon scope discipline.** Phase 0 (score + plan) shipped value before Phase 1 (generate + deliver). We resisted Nexla, full People API sync, and live LinkedIn feeds until the core loop worked.

## What's next for ReachPilot : Your Copilot for relationship upkeep

**Phase 2 — Contact sync:** Google People API → JSON pipeline so the fixture file goes away; contacts flow automatically from Google Contacts labels.

**Phase 2 — Buildkite schedule:** Weekday 7am PT trigger with AWS OIDC for Bedrock; true hands-off morning runs.

**Phase 3 — Richer signals:** Chrome extension activity cache (LinkedIn posts when *you* browse), Twitter/X cross-posts via RSS, reply/open tracking fed back into the scorer.

**Phase 3 — Smarter A/B:** Epsilon-greedy subject line selection once Warmup History has enough sends to measure reply rates.

**Phase 4 — Beyond warmup:** The same agent architecture applies to network-followups, job outreach, and post-meetup follow-ups — one **relationship upkeep copilot** across the entire Career Catalyst stack.

ReachPilot started as a better Morning Warmup email. It's becoming the autonomous layer that keeps your network warm while you focus on building.

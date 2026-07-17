# ReachPilot: Your Copilot for relationship upkeep

Self-directing network warmup agent — replaces random Morning Warmup picks with scored contacts, live enrichment, Bedrock generate/judge/correct, and Gmail drafts.

## Inspiration

Job search isn't only applications and résumés — it's relationships. For years I ran a **Morning Warmup** ritual: pick a handful of contacts, draft a check-in email, and ask for intros. The tooling existed (`mail-merge` in Career Catalyst), but the workflow didn't scale.

Every morning looked the same: **five random Google Contacts**, a static Gmail template (`"Catching up + a quick ask"`), and merge fields limited to name and email. No memory of who I'd warmed up last week. No signal from what someone actually posted. No quality check before the draft landed in my inbox.

I'm a hands-on engineering leader who lives in my network — mentors, founders, peers, recruiters. The problem wasn't motivation; it was **research tax**. Personal outreach that doesn't feel personal is worse than no outreach at all.

I wanted an agent that could do the unglamorous work — score who needs attention, find a real hook, write the draft, catch itself when the hook is weak — while keeping me in the loop to review and send. **ReachPilot** is that agent.

## What it does

ReachPilot replaces random touchbase emails with a **self-directing agent** that runs a daily **Plan → Act → Observe → Correct** loop:

1. **Plan** — Scores your contact pool (days since last warmup, relationship tier, enrichability) and picks the top N — not a random shuffle.
2. **Act** — Enriches each contact from live signals: blog RSS, Google Contacts notes, **EnrichLayer** LinkedIn profiles, Twitter handles — with automatic fallback when a source fails.
3. **Observe** — **Amazon Bedrock** (Claude Haiku 4.5) generates personalized `{{Zeitgeisty}}` and `{{Personalization}}` tokens; Sonnet 4.6 judges each draft for warmth, specificity, and "creepy factor."
4. **Correct** — Regenerates weak drafts with judge feedback, up to three iterations.
5. **Deliver** — Creates **Gmail drafts** (human-in-the-loop), logs results to a **Warmup History** sheet, and sends you a rich digest email summarizing hooks, confidence, and draft links.

Subject lines rotate through five A/B variants. Every run is auditable via a run spec JSON. Nothing auto-sends — you stay in control.

**CLI at a glance:**

```bash
npm run warmup:sync-contacts -- -o contacts.json   # Google People API → JSON
npm run warmup:run -- --from-google --sheet "$WARMUP_SHEET_URL"
```

## How I built it

ReachPilot is a Node/TypeScript agent in this package, extending patterns elsewhere in Career Catalyst (mail-merge, network-followups, networker).

**Architecture highlights:**

| Layer | Technology |
|-------|------------|
| Orchestration | **Buildkite** — lint, test, dry-run on push; scheduled weekday live run with AWS OIDC |
| Agent logic | Custom PARC orchestrator + curated tool registry (Zero-inspired, ~12 tools not 29K) |
| LLM | **Amazon Bedrock** — Haiku 4.5 for generation, Sonnet 4.6 for quality gate (cross-region inference profiles) |
| Enrichment | **EnrichLayer** Person Profile API (LinkedIn), RSS fetcher, contact notes |
| Contacts | **Google People API** sync — mirrors mail-merge label exclusions |
| State | Google Sheets "Warmup History" tab (20 columns: hooks, A/B variant, quality scores) |
| Delivery | Gmail API — draft creation + Morning digest email |
| Scoring | Weighted contact ranker mirroring existing mail-merge exclusion labels |

**Phased delivery:**

- **Phase 0** — Contact scorer, run planner, sheet schema, subject A/B, CLI (`plan`, `score`, `init-sheet`)
- **Phase 1** — Enrichment executor, Bedrock generator/judge, corrector loop, Gmail adapter, digest, full `run` command
- **Phase 2** — Google Contacts adapter (`sync-contacts`, `--from-google`), expanded OAuth scopes, Buildkite scheduled pipeline

37 unit tests. Offline dry-run mode for CI and hackathon demos without live AWS credentials.

I reused existing Career Catalyst pieces instead of greenfielding: mail-merge templates and exclusion labels, network-followups sheet patterns, and networker's EnrichLayer client.

## Challenges I ran into

**LinkedIn activity feeds don't exist for free.** I initially wanted "latest 5 posts" personalization. LinkedIn ToS and API restrictions make live feed scraping unreliable. I pivoted to **EnrichLayer profile enrichment** (headline, role, summary) plus blog RSS and cached notes — honest fallbacks when signals are thin.

**Proxycurl → EnrichLayer migration.** The enrichment API I planned around was acquired and sunset. I migrated to EnrichLayer's `/api/v2/profile` endpoint and renamed enrichment sources throughout the agent.

**OAuth scope drift.** Phase 2 added `contacts.readonly` for People API sync, but existing refresh tokens didn't include it. I hit `403 insufficient authentication scopes` until re-running `npm run setup-gmail` with forced consent.

**Bedrock model churn.** Claude 3.5 Haiku reached EOL; newer models require **cross-region inference profile IDs** (`global.anthropic.claude-haiku-4-5-...`) instead of bare foundation model IDs. Sonnet 4.6's adaptive thinking sometimes returned prose instead of JSON — I hardened parsing, added fallbacks, and tuned the Bedrock provider for structured output.

**AWS Marketplace billing.** Live runs failed with `INVALID_PAYMENT_INSTRUMENT` until a valid payment method and Anthropic model subscription were enabled in the AWS account — a gotcha that doesn't show up in offline dry-run.

**The quality gate is strict by design.** With the default threshold of 70, drafts with generic hooks or a broken template sign-off (raw Google Contacts URL where a name should be) correctly fail. I added `WARMUP_MIN_DRAFT_QUALITY` for demo mode while I fix template rendering.

**False "draft created" for no-email contacts.** A contact scored highly but had no email in Google Contacts — the agent marked `DRAFT_CREATED` without calling Gmail. I now exclude no-email contacts from planning and mark them `SKIPPED` with a clear message.

**GAS limits vs. agent loops.** The original Morning Warmup lived in Google Apps Script — fine for drafts, poor for multi-step LLM loops. I moved orchestration to Node/Buildkite while keeping Gmail and Sheets as adapters.

## Accomplishments that we're proud of

- Turned a **manual, random, amnesiac** email routine into an **autonomous, scored, self-correcting** agent — without removing human send approval.
- Shipped a **full PARC loop** end-to-end: plan spec → enrichment → generation → quality gate → retry → Gmail draft → sheet history → digest.
- **Synced 4,000+ Google Contacts** via People API with label exclusions matching the original mail-merge logic.
- Ran **live Bedrock + Gmail** from the CLI — real Haiku/Sonnet calls, real drafts, real Warmup History rows.
- Built **auditable runs** — every contact gets a hook type, confidence score, judge feedback, and iteration count. You can explain *why* the agent picked someone and *what* it referenced.
- **37 tests passing**, Buildkite pipelines defined for push (dry-run) and scheduled weekday live runs.

## What I learned

**Autonomy isn't auto-send.** The best outreach agents keep humans at the send button but remove the research and first-draft grind. Drafts + digest email is the right contract.

**Enrichment beats generation.** The LLM is only as good as its signals. Investing in source priority (RSS → notes → EnrichLayer → Twitter) and fallback chains mattered more than prompt tuning.

**Self-correction needs measurable gates.** "Regenerate until good" is vague; a Sonnet judge with a numeric threshold and explicit creepy-check makes the loop real and demo-able.

**Infrastructure is part of the product.** Bedrock inference profiles, OAuth scope upgrades, Marketplace billing, and JSON parse reliability aren't glamorous — but they're what separates a demo script from something that runs every weekday morning.

**Curated tool registries beat marketplaces.** Zero.xyz's insight — discover tools on demand — is powerful at scale. For a daily 5-contact job, ~12 known tools with health tracking is simpler and debuggable.

**Hackathon scope discipline.** Phase 0 (score + plan) shipped value before Phase 1 (generate + deliver). I resisted Nexla and live LinkedIn feeds until the core loop worked.

## What's next for ReachPilot : Your Copilot for relationship upkeep

**Buildkite productionization** — Commit CI fixtures, wire pipeline secrets, configure AWS OIDC role, and enable the weekday 7am PT schedule for hands-off runs.

**Template polish** — Fix `ContactURL` rendering in the sign-off (sender metadata, not recipient-visible URL), improve offline/generic hook copy, and exclude self from the contact pool.

**Phase 3 — Richer signals** — Chrome extension LinkedIn activity cache (posts when *you* browse), reply/open tracking fed back into the scorer, epsilon-greedy subject A/B once Warmup History has enough sends.

**Phase 4 — Beyond warmup** — The same agent architecture applies to network-followups, job outreach, and post-meetup follow-ups — one **relationship upkeep copilot** across the entire Career Catalyst stack.

ReachPilot started as a better Morning Warmup email. It's becoming the autonomous layer that keeps your network warm while you focus on building.

---

See also: [`.buildkite/README.md`](../../.buildkite/README.md) for pipeline setup and secrets.

# ReachPilot — Buildkite Pipeline

## Pipelines

| File | Purpose |
|------|---------|
| `pipeline.yml` | Default — lint, test, dry-run (every push) |
| `pipeline.scheduled.yml` | Weekday live run — Google Contacts + Bedrock + Gmail |

## Scheduled morning run (Phase 2)

Configure in Buildkite **Pipeline → Settings → Schedules**:

| Setting | Value |
|---------|-------|
| Cron | `0 14 * * 1-5` (7:00 AM PT / 14:00 UTC, Mon–Fri) |
| Branch | `main` |
| Message | `ReachPilot scheduled warmup` |
| Pipeline | Upload `pipeline.scheduled.yml` via pipeline upload step, or point schedule at a dedicated pipeline |

### Required environment variables (Buildkite secrets)

```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN          # must include contacts.readonly + gmail.compose + spreadsheets
ENRICHLAYER_API_TOKEN
MY_EMAIL
WARMUP_SHEET_URL
AWS_BEDROCK_ROLE_ARN        # IAM role for OIDC → Bedrock
AWS_REGION=us-east-1
```

Bedrock models (ReachPilot): Haiku 4.5 generator, Sonnet 4.6 judge. Newer Anthropic
models require **cross-region inference profile IDs** (not bare foundation model IDs).
Defaults use the `global.` prefix. Override with `BEDROCK_INFERENCE_PREFIX=us.` if needed.

IAM needs `bedrock:InvokeModel` on:
- `global.anthropic.claude-haiku-4-5-20251001-v1:0`
- `global.anthropic.claude-sonnet-4-6`
- (and/or the underlying foundation model ARNs for your region)

### Local commands

```bash
# Export Google Contacts to JSON
npm run warmup:sync-contacts -- -o contacts.json

# Live run from Google Contacts
npm run warmup:run -- --from-google --sheet "$WARMUP_SHEET_URL"

# Or set env default
WARMUP_USE_GOOGLE_CONTACTS=true npm run warmup:run
```

### OAuth scopes

Re-run `npm run setup-gmail` after pulling Phase 2 — adds:

- `contacts.readonly` — Google People API sync
- `gmail.compose` — draft creation
- `gmail.send` — digest email

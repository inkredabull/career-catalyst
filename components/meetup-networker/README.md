# Meetup Networker

A TypeScript CLI tool that parses a list of names and looks up LinkedIn profiles using the EnrichLayer API.

## Features

- Parses name lists (one name per line)
- Identifies entries with both first and last names
- Skips entries with only a single name
- Looks up current job titles and locations via EnrichLayer
- Filters by city (San Francisco)
- Automatically detects event name from filename
- **Tiered prioritization** - Assigns contacts to `TIER_1`, `TIER_2`, `TIER_3`, or `NONE`
- **Review-first workflow** - Defaults to review mode; only sends when `--send` is explicitly passed
- **Controlled send batches** - Limits automation volume with tier filters and max send count
- **Local caching** - Saves lookups to avoid burning credits on repeated queries
- **Credit tracking** - Shows before/after credit balance and cost

## Installation

```bash
npm install
```

## Setup

1. Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Get your EnrichLayer API token from [https://enrichlayer.com](https://enrichlayer.com)

3. Add your token to the `.env` file:
   ```
   ENRICHLAYER_API_TOKEN=your_token_here
   ```

## Usage

```bash
# Review run (default mode)
npm start "examples/Tech Networking Mixer on 3-15-25.txt"

# Send only top tier profiles (after review)
npm start "examples/Tech Networking Mixer on 3-15-25.txt" -- --send --send-tier tier_1 --max-sends 8

# Optional: run with explicit batch size (clamped to 10-15)
npm start "examples/Tech Networking Mixer on 3-15-25.txt" -- --batch-size 12

# Or use tsx directly
npx tsx src/index.ts "examples/Tech Networking Mixer on 3-15-25.txt" --send --send-tier tier_1

# After building
npm run build
node dist/index.js "examples/Tech Networking Mixer on 3-15-25.txt"
```

## Input Format

Create a text file with one name per line. The filename can include an event name and date:

```
Alice Johnson
Bob Smith
charlie
Diana Martinez
```

The tool will:
- Process "Alice Johnson", "Bob Smith", and "Diana Martinez" (have first + last name)
- Skip "charlie" (only has one name)
- Look up their current job titles and locations using EnrichLayer

## How It Works

1. **Cache Check**: First checks the `logs/` directory for cached results
2. **Search**: If not cached, searches EnrichLayer for people by first name, last name, and city (San Francisco)
3. **Profile Fetch**: Retrieves detailed LinkedIn profile information
4. **Current Role**: Identifies the most recent job (where `ends_at` is null)
5. **Priority Tiering**: Classifies title/company into `TIER_1`, `TIER_2`, `TIER_3`, or `NONE`
6. **Cache Save**: Saves successful lookups to `logs/` for future use
7. **Display**: Shows name, role, tier, and weekly follow-up status
8. **Weekly Loop**: Review first, then run with `--send` to automate only selected tier(s)

## Priority Tiers

The tool assigns a follow-up tier using title + company text:

- **`TIER_1`** - Investors + C-suite (default send tier)
- **`TIER_2`** - VP / Head / Director / Founder profiles
- **`TIER_3`** - Optional long-tail follow-ups (disabled by default unless configured)
- **`NONE`** - No outreach priority

### Output Indicators

- ⭐ **`[TIER_X]`** - Appears next to prioritized contacts
- ✅ **REVIEW** - Candidate for weekly follow-up
- ⏭️ **SKIP** - No priority tier match
- **Summary** - Includes per-tier totals (e.g., `T1=4, T2=7, T3=0`)

### Example Output

```
1. John Doe [⭐ TIER_1]
   Current Title: Managing Partner
   Current Company: XYZ Capital
   Location: San Francisco, CA
   LinkedIn: https://www.linkedin.com/in/johndoe
   Status: ✅ REVIEW - TIER_1 follow-up candidate

2. Jane Smith
   Current Title: Software Engineer
   Current Company: Tech Corp
   Location: San Jose, CA
   LinkedIn: https://www.linkedin.com/in/janesmith
   Status: ⏭️  SKIP - No priority tier match
```

## Weekly Review/Send Loop

The default mode is **review only** (no tabs opened, no message injection).
To send, run a second pass with `--send`:

```bash
npm start "<event file>.txt" -- --send --send-tier tier_1 --max-sends 8
```

`--send-tier` supports `tier_1`, `tier_2`, `tier_3`, or `all`.
`--max-sends` keeps weekly send volume predictable and lower risk.

## Caching

The tool automatically caches all successful lookups in the `logs/` directory to avoid burning API credits on repeated queries.

### How Caching Works

- **Cache Location**: `logs/firstname-lastname.json`
- **Automatic**: Caching happens automatically - no configuration needed
- **Cache Hit**: When a cached entry is found, you'll see `[CACHED]` in the output
- **Credit Savings**: Cached lookups don't consume API credits

### Managing the Cache

```bash
# View cached entries
ls logs/

# Clear all cached entries
rm -rf logs/

# Remove a specific cached entry
rm logs/alice-johnson.json
```

The cache persists across runs, so running the same name list multiple times will only consume credits on the first run.

## Environment Variables

Environment variables in `.env`:

```
# Required: EnrichLayer API Bearer Token
ENRICHLAYER_API_TOKEN=your_token_here

# Optional: City to filter searches (default: San Francisco)
SEARCH_CITY=San Francisco

# Optional: Batch size (clamped to 10-15, default 12)
BATCH_SIZE=12

# Optional: Tiered prioritization patterns (regex, case-insensitive)
TARGET_TIER_1_PATTERN=Managing\s+Partner|General\s+Partner|\bPartner\b|\bVC\b|Venture\s+Capital|\bInvestor\b|\bCapital\b|C[TEOFMPI]O|Chief\s+\w+\s+Officer
TARGET_TIER_2_PATTERN=Vice\s+President|\bVP\b|\bVPE\b|Head\s+of|\bPrincipal\b|\bDirector\b|DIR\s+ENG|Founder|Co-?Founder
TARGET_TIER_3_PATTERN=

# Optional: Legacy fallback pattern (backwards compatibility)
TARGET_CONTACT_PATTERN=Partner|Capital|VC|Investor|C[TEOFMPI]O|Chief\s+\w+\s+Officer|VP|VPE|Director|DIR\s+ENG
```

### Customizing Priority Tiers

Edit `TARGET_TIER_1_PATTERN`, `TARGET_TIER_2_PATTERN`, and `TARGET_TIER_3_PATTERN` in `.env`.
Patterns are case-insensitive regex tested against combined title + company text.

**Examples:**
- Tight investor-only Tier 1: `Managing\\s+Partner|General\\s+Partner|\\bVC\\b|\\bInvestor\\b`
- Broader operator Tier 2: `VP|Head\\s+of|Director|Founder`
- Leave Tier 3 empty to disable long-tail outreach

## Project Structure

```
src/
├── index.ts           # CLI entry point
├── nameParser.ts      # Name parsing logic
├── eventParser.ts     # Event name extraction from filename
├── profileLookup.ts   # EnrichLayer API integration
└── cache.ts           # Local caching for lookup results
logs/                  # Cached lookup results (auto-created)
examples/
└── Tech Networking Mixer on 3-15-25.txt  # Example input file
```

## Development

```bash
# Watch mode
npm run dev "examples/Tech Networking Mixer on 3-15-25.txt"

# Build
npm run build

# Run tests
npm test

# Test watch mode
npm run test:watch

# Type check
npx tsc --noEmit
```

## Testing

The project includes unit tests for core functionality:

```bash
npm test
```

Tests cover:
- Name parsing logic
- Event name extraction
- Edge cases and error handling

## License

MIT

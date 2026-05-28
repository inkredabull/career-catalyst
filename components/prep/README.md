# @inkredabull/career-catalyst-prep

Interview preparation CLI and agents — generates about-me statements, focus stories, cover letters, endorsements, and thematic analysis for a specific job. Part of the career-catalyst monorepo.

## How It Works

1. Loads the target job from `logs/<jobId>/job-cache.json` (written by the core extractor)
2. Reads your `cv.txt` from the project root
3. Calls Claude to generate the requested material
4. Saves output to `logs/<jobId>/` and copies RTF-formatted content to the clipboard

All generated sections are cached — re-running a command uses the cached version unless `--regen` is passed.

## Prerequisites

- Node.js 18+
- `cv.txt` in the project root
- A tracked job (`npm run dev extract <url>` via core, or `npm run dev track <jobId>`)
- Environment variables configured (see `.env.example` in the project root)

### Required env vars

```
ANTHROPIC_API_KEY=...     # Claude API key — all generation uses Claude
```

### Optional env vars

```
ANTHROPIC_MODEL=...       # Default: claude-sonnet-4-6
ANTHROPIC_MAX_TOKENS=...  # Default: 8192
```

## Usage

Run via the root workspace script:

```bash
npm run prep -- prep <type> <jobId> [options]
```

Or directly from this package:

```bash
npm run dev -- prep <type> <jobId> [options]
```

---

### Statement types

| Type | Description |
|------|-------------|
| `cover-letter` | Tailored cover letter for the role |
| `endorsement` | Third-party endorsement / recommendation text |
| `about-me` | Full about-me statement (all sections combined) |
| `general` | General-purpose prep statement |
| `interview` | Comprehensive interview prep (about-me + focus story + themes + company fit) |
| `focus` | Alias for `interview` |

```bash
# Generate a cover letter
npm run prep -- prep cover-letter <jobId>

# Generate in third person (for endorsements)
npm run prep -- prep cover-letter <jobId> --person third

# Force regenerate (ignore cache)
npm run prep -- prep cover-letter <jobId> --regen

# Output content only (no formatting, useful for piping)
npm run prep -- prep cover-letter <jobId> --content
```

---

### About-me sections

The about-me statement is broken into 8 named sections that can be generated, critiqued, and refined individually.

```bash
npm run prep -- about-me-hook <jobId>
npm run prep -- about-me-career-snapshot <jobId>
npm run prep -- about-me-themes <jobId>
npm run prep -- about-me-why <jobId>
npm run prep -- about-me-focus-story <jobId>
npm run prep -- about-me-close <jobId>
npm run prep -- about-me-personal-touch <jobId>
npm run prep -- about-me-questions <jobId>
```

Each section command accepts:

| Flag | Description |
|------|-------------|
| `--regen` | Force regenerate, ignoring cache |
| `--critique` | Critique the existing section (rating + strengths + recommendations) |
| `--view` | Print the current section content |
| `-e, --emphasis <text>` | Emphasis or special focus for this generation |
| `-c, --company-info <text>` | Extra company context |
| `-i, --instructions <text>` | Custom instructions appended to the prompt |

---

### Interactive about-me manager

```bash
npm run prep -- prep about-me <jobId> --interactive
```

Launches a menu-driven interface to generate, regenerate, critique, refine, view, and combine all sections.

---

### Themes and stories

```bash
# Extract key themes from the JD matched to CV examples
npm run prep -- prep themes <jobId>

# List interview stories derived from theme extraction
npm run prep -- prep stories <jobId>
```

---

### Profile

```bash
# Generate a profile summary + Google Apps Script for Sheets
npm run prep -- prep profile
```

---

### Project extraction (Catalant format)

```bash
# List extractable projects from CV
npm run prep -- prep list-projects <jobId>

# Extract a specific project in copy-paste form
npm run prep -- prep project <jobId> <projectNumber>
```

---

### Common options (all `prep` subcommands)

| Flag | Description |
|------|-------------|
| `--regen` | Force regenerate (ignore cached content) |
| `--content` | Output content only — no status lines, ideal for piping |
| `-e, --emphasis <text>` | Special emphasis or topic focus |
| `-c, --company-info <text>` | Additional company context |
| `-i, --instructions <text>` | Custom instructions for the generation |
| `-p, --person <first\|third>` | Writing perspective (default: `first`) |
| `--company-url <url>` | Company website for values/culture research |
| `--interactive` | Interactive section manager (about-me only) |

## Caching

All generated content is cached in `logs/<jobId>/about-me/`. Each section is stored as JSON with version tracking:

```
logs/<jobId>/
  about-me/
    hook.json
    career-snapshot.json
    themes.json
    why.json
    focus-story.json
    close.json
    personal-touch.json
    questions.json
  cover-letter-<timestamp>.txt
  endorsement-<timestamp>.txt
```

Pass `--regen` to any command to overwrite the cached version.

## Output

RTF-formatted content is copied to the macOS clipboard automatically after generation (ready to paste into Google Docs, Mail, or Notes with formatting preserved).

## Architecture

```
components/prep/
  prompts/
    statement-about-me-hook.md
    statement-about-me-career-snapshot.md
    statement-about-me-themes.md
    statement-about-me-why.md
    statement-about-me-focus-story.md
    statement-about-me-close.md
    statement-about-me-personal-touch.md
    statement-about-me-questions.md
  src/
    agents/
      interview-prep-agent.ts   Core generation, caching, critiquing, and combining logic (2,700+ lines)
    types/
      index.ts                  Prep-specific TypeScript interfaces
    cli.ts                      Commander.js CLI — all prep and about-me-* commands
    index.ts                    Public exports (InterviewPrepAgent + all types)
  package.json
  tsconfig.json
  README.md
```

## Integration

This package is imported by `@inkredabull/career-catalyst-apply`, which uses `InterviewPrepAgent` to auto-generate cover letters before filling application forms. The unified server also invokes the `prep cover-letter` command to generate blurbs for the dashboard.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { resolve } from "path";

// ─── CV ───────────────────────────────────────────────────────────────────────
// Read from cv.txt at the career-catalyst root so there is a single source of truth.
const cvPath = resolve(__dirname, "../../../cv.txt");
export const CV = readFileSync(cvPath, "utf8").trim();

// ─── SCORING RUBRIC ───────────────────────────────────────────────────────────
export const RUBRIC = `
## 14-Dimension Scoring Rubric

### Primary dimensions (1–5 each, count toward total, max 40)
These are the direct pursue/pass drivers. Score honestly.
- 5 = Exceptional fit, exceeds bar
- 4 = Strong fit, clearly qualifies
- 3 = Adequate fit, some gaps or unknowns
- 2 = Weak fit, meaningful misalignment (🟡 Yellow flag)
- 1 = Poor fit or dealbreaker (🔴 Red flag)

1. Skills & Strengths Alignment — Evaluate the role's actual day-to-day mandate, not the company's age or size. Does this specific role require AI-native systems, RAG, LLMs, platform/infra, or 0-to-1 building? A "Director of AI Engineering" inside a large company can score 4 if the mandate is genuine. A startup role that's really legacy maintenance scores 2.
2. Role Availability & Growth — Clear mandate and upward path? Avoid IC-heavy or purely operational roles. Note: CPTO or CTO/CPO compound titles with genuine product+tech authority score 4–5 regardless of company type (startup, PE-backed, public). Evaluate actual decision-making scope, not just the title tier.
3. Values & Mission Fit — Does the company's mission connect to Anthony's long-term arc?
4. Compensation & Stability — Target: $225K+ base salary. Score 1 ONLY if comp is explicitly stated below $225K base, or the role is equity-only / deferred comp. Undisclosed comp at a small or bootstrapped company = score 2 (yellow flag, verify) — not automatic 1. Public company RSU bands verifiable from market data are a positive stability signal.
5. Company Culture Norms — Look for specific red flags: mandatory in-office culture, known process-heavy bureaucracy explicitly described in the JD, recent layoffs, or role descriptions that read as maintenance not innovation. Do NOT penalize a company categorically for being large or established — evaluate the signals in the JD itself.
6. Lifestyle & Flexibility — Remote-friendly preferred; SF Bay Area in-person acceptable. If a role is outside SF Bay Area but the JD is ambiguous on remote flexibility, score 2 (flag for verification) — do not score 1 unless the JD explicitly states in-office required with no remote option. Relocation required + confirmed non-remote = score 1.
7. Personal Excitement & Curiosity — Would Anthony be energized by this problem space?
8. Internal Mobility — Could this role evolve into a true CTO mandate over time?

### Context dimensions (1–3 each, informational, max 18)
Score 3 = positive signal, 2 = minor concern, 1 = notable gap. Cap at 3 — these provide color but don't drive the verdict alone.

9.  Learning & Innovation — Will Anthony be stretched technically and strategically?
10. Network & Access — Does this company or exec team open doors Anthony doesn't already have?
11. Leadership Reputation — Any signals on the exec team (prior exits, public presence, employee sentiment)?
12. Glassdoor / Employee Sentiment — If company is known, any public signals worth noting?
13. Recent News / Growth Direction — Is the company on an upward trajectory?
14. Recruiter Responsiveness — Default 3 if not yet engaged.

Hard filters (score 1 if triggered):
- Comp is explicitly stated below $225K base, or the role is equity-only / deferred
- Role is explicitly full-time in-office with no remote option, outside SF Bay Area (confirmed relocation required)
- IC-heavy with no direct reports or org-building mandate
- Role has no technical leadership or AI/ML innovation mandate (ask: would Anthony's AI expertise grow or be used here?)

Soft filters (flag as yellow if absent):
- React / Python / TypeScript in the stack
- GCP as primary cloud
- Series A–B stage or public company with verified strong TC band
- Executive team with at least one prior exit
- Undisclosed comp at a company with no verifiable market data

If information is missing from the JD, score 3 and note "Not disclosed — verify before advancing."

## Output Format

Produce a scorecard in this exact structure:

---

### 🏢 [Company Name] — [Role Title]

**Stage:** [e.g., Series B] | **Stack:** [e.g., Python, React, GCP] | **Remote:** [e.g., Remote-friendly]
**Comp:** [e.g., $220–260K + equity] | **Reporting to:** [e.g., CEO]

#### Dimension Scores

| # | Dimension | Score | Flag | Notes |
|---|-----------|:-----:|------|-------|
| 1 | Skills & Strengths Alignment | X | | |
... (all 15 rows) ...

**Total: XX / 58** (primary: XX/40 | context: XX/18)

#### 🔴 Red Flags
- [List scores of 1 or hard filter failures, or "None" if clean]

#### 🟡 Yellow Flags
- [List scores of 2 or soft filter gaps, or "None" if clean]

---

#### Verdict

> **[JUDGMENT LABEL]** — [1–2 sentence plain-language rationale]

Judgment labels (pick exactly one):
- 🟢 Strong Fit — Pursue Actively
- 🟡 Conditional Fit — Dig Deeper Before Committing
- 🔴 Pass — Meaningful Misalignment

---

#### Recommended Next Action

One of:
- **Apply + Reach Out** — Submit application AND identify a warm path. [Who to target if known.]
- **Research First** — [Specific gap to clarify before applying.]
- **Pass** — [One honest sentence on why.]

---

Scoring notes:
- A 3.5/5 average is NOT a Strong Fit.
- Below 35/58 total → default to Pass or Conditional unless exceptional circumstances exist.
- Primary score below 20/40 → near-automatic Pass regardless of context scores.
- Be honest. Anthony's time is finite.
`.trim();

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
export const SYSTEM_PROMPT = `
You are a senior executive recruiter and job search coach. You score job descriptions
against Anthony Bull's profile as a VP Engineering / CTO candidate.

When given a job description (via URL fetch or pasted text), you:
1. Extract role title, company, stage, location/remote, stack, team size, comp, key responsibilities,
   and must-have requirements. Note anything missing as "Not disclosed."
2. Score the role on 15 dimensions using the rubric below.
3. Apply hard and soft filters.
4. Output a structured scorecard exactly as specified.

Be direct, honest, and specific. Anthony's time is finite.

## Anthony's Profile

${CV}

## Scoring System

${RUBRIC}
`.trim();

// ─── URL FETCHER (via Jina Reader — no API key needed) ───────────────────────
async function fetchUrl(url: string): Promise<string> {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const res = await fetch(jinaUrl, {
    headers: { Accept: "text/plain" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Jina fetch failed: ${res.status} ${res.statusText}`);
  const text = await res.text();
  return text.slice(0, 12_000);
}

// ─── AGENTIC LOOP ─────────────────────────────────────────────────────────────
export async function scoreJD(input: string): Promise<string> {
  const client = new Anthropic();

  const tools: Anthropic.Tool[] = [
    {
      name: "fetch_url",
      description:
        "Fetch the full text content of a URL (job posting, ATS page, company page). " +
        "Use this to retrieve job descriptions from URLs provided by the user.",
      input_schema: {
        type: "object" as const,
        properties: {
          url: {
            type: "string",
            description: "The URL to fetch",
          },
        },
        required: ["url"],
      },
    },
  ];

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: input }];

  process.stderr.write("⏳ Scoring...\n");

  while (true) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    if (response.stop_reason === "end_turn") {
      return response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
    }

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        if (block.name === "fetch_url") {
          const url = (block.input as { url: string }).url;
          process.stderr.write(`🌐 Fetching: ${url}\n`);
          let result: string;
          try {
            result = await fetchUrl(url);
            process.stderr.write(`✅ Fetched ${result.length} chars\n`);
          } catch (err) {
            result = `Error fetching URL: ${(err as Error).message}`;
            process.stderr.write(`❌ ${result}\n`);
          }
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
      continue;
    }

    throw new Error(`Unexpected stop_reason: ${response.stop_reason}`);
  }
}

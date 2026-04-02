import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { resolve } from "path";

// ─── CV ───────────────────────────────────────────────────────────────────────
// Read from cv.txt at the career-catalyst root so there is a single source of truth.
const cvPath = resolve(__dirname, "../../../cv.txt");
export const CV = readFileSync(cvPath, "utf8").trim();

// ─── SCORING RUBRIC ───────────────────────────────────────────────────────────
export const RUBRIC = `
## 15-Dimension Scoring Rubric (1–5 each)

Score each dimension for Anthony specifically:
- 5 = Exceptional fit, exceeds bar
- 4 = Strong fit, clearly qualifies
- 3 = Adequate fit, some gaps or unknowns
- 2 = Weak fit, meaningful misalignment (🟡 Yellow flag)
- 1 = Poor fit or dealbreaker (🔴 Red flag)

Dimensions:
1. Skills & Strengths Alignment — Does the role leverage AI-native systems, RAG, LLMs, platform/infra, 0-to-1 building?
2. Role Availability & Growth — Clear mandate and upward path? Avoid IC-heavy or purely operational roles.
3. Values & Mission Fit — Does the company's mission connect to Anthony's long-term arc?
4. Compensation & Stability — Target: $255K+ TC. Flag if not disclosed or likely below target.
5. Learning & Innovation — Will Anthony be stretched technically and strategically?
6. Company Culture Norms — Evidence of async-first, high-trust, low-bureaucracy culture?
7. Lifestyle & Flexibility — Remote-friendly preferred; in-person in San Francisco is acceptable. Only flag roles requiring relocation or outside SF Bay Area.
8. Network & Access — Does this company or exec team open doors Anthony doesn't already have?
9. Personal Excitement & Curiosity — Would Anthony be energized by this problem space?
10. Leadership Reputation — Any signals on the exec team (prior exits, public presence, employee sentiment)?
11. Glassdoor / Employee Sentiment — If company is known, any public signals worth noting?
12. Recent News / Growth Direction — Is the company on an upward trajectory?
13. DEI Commitment — Any signals in the JD or public record?
14. Internal Mobility — Could this role evolve into a true CTO mandate over time?
15. Recruiter Responsiveness — Default 3 if not yet engaged.

Hard filters (score 1 if triggered):
- Comp ceiling clearly below $255K TC
- Full-time in-office outside San Francisco Bay Area (requires relocation)
- IC-heavy with no direct reports or org-building mandate
- No AI/ML component to the product or platform

Soft filters (flag if absent):
- React / Python / TypeScript in the stack
- GCP as primary cloud
- Series A or B stage (sweet spot)
- Executive team with at least one prior exit

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

**Total: XX / 75**

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
- Below 45/75 total → default to Pass or Conditional unless exceptional circumstances exist.
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

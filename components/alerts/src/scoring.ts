import Anthropic from "@anthropic-ai/sdk";
import { ENV } from "./config/settings";
import { JobResult, buildLiHeaders } from "./linkedin";
import { log } from "./utils/logger";

// ---------------------------------------------------------------------------
// Rubric — kept in sync with components/scorer/src/scorer.ts
// ---------------------------------------------------------------------------

const RUBRIC = `
## 13-Dimension Scoring Rubric

### Primary dimensions (1–5 each, count toward total, max 40)
These are the direct pursue/pass drivers. Score honestly.
- 5 = Exceptional fit, exceeds bar
- 4 = Strong fit, clearly qualifies
- 3 = Adequate fit, some gaps or unknowns
- 2 = Weak fit, meaningful misalignment (🟡 Yellow flag)
- 1 = Poor fit or dealbreaker (🔴 Red flag)

1. Skills & Strengths Alignment — Does this role require AI-native systems, RAG, LLMs, platform/infra, or 0-to-1 building? Also treat AI enablement, AI adoption strategy, AI commercialization, and applied GenAI solution delivery as high-signal matches — not just engineering-build mandates.
2. Role Availability & Growth — Clear mandate and real decision-making scope? CPTO, CTO/CPO, or Head of AI titles with genuine authority score 4–5. AI enablement or AI solutions roles with P&L ownership, client-facing delivery authority, or org-building scope also score 4–5 — do NOT require an explicit CTO growth path to score high here.
3. Values & Mission Fit — Does the company's mission connect to Anthony's long-term arc?
4. Compensation & Stability — Target: $225K+ base. Score 1 only if comp explicitly below $225K or equity-only. Undisclosed = score 2.
5. Company Culture Norms — Red flags: mandatory in-office, process-heavy bureaucracy in JD, recent layoffs. Don't penalize for size alone.
6. Lifestyle & Flexibility — Remote-friendly preferred; SF Bay Area in-person acceptable. Ambiguous on remote = score 2. Confirmed relocation required = score 1.
7. Personal Excitement & Curiosity — Would Anthony be energized by this problem space? High-signal domains: AI enablement and adoption, enterprise GenAI commercialization, applied AI strategy, agentic system design, bridging AI research and production delivery, and 0-to-1 AI product or platform building.
8. Internal Mobility — Could this role evolve into greater strategic authority — whether CTO, VP of Engineering, Head of AI, Chief AI Officer, or equivalent? Credit any clear upward path to owning technical or AI strategy at the company level.

### Context dimensions (1–3 each, informational, max 15)
9.  Learning & Innovation
10. Network & Access
11. Leadership Reputation
12. Glassdoor / Employee Sentiment
13. Recent News / Growth Direction

Hard filters (score 1): comp below $225K, confirmed in-office outside SF Bay Area, IC-only, no AI/tech leadership mandate.
Soft filters (flag yellow if absent): React/Python/TypeScript stack, GCP, Series A–B or verified strong TC public co, prior exit on exec team.

Categorical Pass override: if the posting shows 100 or more applicants ("N applicants", "Over N applicants", "N people clicked apply"), the role is oversaturated — set the verdict to 🔴 Pass regardless of dimension scores.

Judgment labels (pick exactly one):
- 🟢 Strong Fit — Pursue Actively
- 🟡 Conditional Fit — Dig Deeper Before Committing
- 🔴 Pass — Meaningful Misalignment
`.trim();

// ---------------------------------------------------------------------------
// JD fetch — Voyager for LinkedIn, Jina Reader for everything else
// ---------------------------------------------------------------------------

async function fetchViaJina(url: string): Promise<string> {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: { Accept: "text/plain" },
    signal: AbortSignal.timeout(8_000),
  });
  log("DEBUG", "Jina HTTP %s for %s", res.status, url.slice(0, 80));
  if (!res.ok) return "";
  const text = await res.text();
  // Treat DDoS/block responses as empty so the caller sees no JD
  if (
    text.toLowerCase().includes("ddos") ||
    text.toLowerCase().includes("blocked") ||
    text.length < 200
  ) {
    log("DEBUG", "Jina returned suspected block page for %s", url.slice(0, 80));
    return "";
  }
  return text.slice(0, 12_000);
}

/** The numeric posting id out of a canonical LinkedIn job URL, if present. */
export function linkedInJobId(url: string): string | null {
  const m = url.match(/\/jobs\/view\/(\d+)/);
  return m ? m[1] : null;
}

/**
 * Decoration schema for the full job posting, including its description.
 *
 * LinkedIn bumps these suffixes periodically. If the log starts showing
 * "Voyager JD HTTP 400/404" for every job, open a posting in the browser with
 * DevTools → Network, filter for `voyager/api/jobs/jobPostings`, and copy the
 * current decorationId from the request URL.
 */
const JD_DECORATION_ID =
  "com.linkedin.voyager.deco.jobs.web.shared.WebFullJobPosting-65";

/**
 * Fetch a LinkedIn job description through the same authenticated Voyager API
 * the search already uses.
 *
 * LinkedIn blocks Jina at the site level, and a paid Reader key does not change
 * that, so a third-party scraper was the only other option — and the free tier
 * of one is a fixed number of credits, after which every score silently
 * degrades to title-only. We are already authenticated here, so this costs
 * nothing and does not run out.
 */
async function fetchViaVoyager(url: string): Promise<string> {
  const jobId = linkedInJobId(url);
  if (!jobId) return "";

  const cookie = process.env[ENV.LI_COOKIE];
  const csrfToken = process.env[ENV.LI_CSRF_TOKEN];
  if (!cookie || !csrfToken) return "";

  try {
    const endpoint =
      `https://www.linkedin.com/voyager/api/jobs/jobPostings/${jobId}` +
      `?decorationId=${JD_DECORATION_ID}`;
    const res = await fetch(endpoint, {
      headers: buildLiHeaders(
        cookie,
        csrfToken,
        `https://www.linkedin.com/jobs/view/${jobId}`,
      ),
      signal: AbortSignal.timeout(10_000),
    });
    log("DEBUG", "Voyager JD HTTP %s for job %s", res.status, jobId);
    if (!res.ok) return "";

    const data = (await res.json()) as {
      description?: { text?: string };
      data?: { description?: { text?: string } };
    };
    // The normalized+json accept header can nest the posting under `data`.
    const text = data.description?.text ?? data.data?.description?.text ?? "";
    return text.slice(0, 12_000);
  } catch (err) {
    log("DEBUG", "Voyager JD failed for %s: %s", jobId, (err as Error).message);
    return "";
  }
}

async function fetchJD(url: string): Promise<string> {
  try {
    // LinkedIn blocks Jina outright, so use the authenticated API instead.
    if (url.includes("linkedin.com")) return await fetchViaVoyager(url);
    return await fetchViaJina(url);
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Scorer
// ---------------------------------------------------------------------------

export interface ScoreResult {
  verdict: "🟢" | "🟡" | "🔴" | "?";
  reasoning: string;
}

type Judgment = "🟢" | "🟡" | "🔴";

const SCORING_MODEL = "claude-haiku-4-5-20251001";

/**
 * Pull the verdict label out of a scoring response.
 *
 * Anchored on the word "Verdict" first, because the emoji also appear inline
 * in the rubric's own dimension notes — matching the bare emoji anywhere would
 * happily return the first red flag mentioned in the reasoning.
 */
export function parseVerdict(text: string): Judgment | null {
  const anchored = text.match(/Verdict[\s\S]{0,100}?(🟢|🟡|🔴)/i);
  if (anchored) return anchored[1] as Judgment;

  // Fall back to a label on its own line near the end, which is where a
  // correctly-formatted answer puts it even if the word is missing.
  const trailing = text.slice(-200).match(/(🟢|🟡|🔴)(?![\s\S]*(?:🟢|🟡|🔴))/);
  return trailing ? (trailing[1] as Judgment) : null;
}

/** Ask for just the label when the first pass didn't produce one. */
async function retryVerdict(
  client: Anthropic,
  assessment: string,
): Promise<Judgment | null> {
  try {
    const res = await client.messages.create({
      model: SCORING_MODEL,
      max_tokens: 8,
      system:
        "Reply with exactly one character and nothing else: 🟢, 🟡, or 🔴.",
      messages: [
        {
          role: "user",
          content:
            `Assessment of a job posting:\n\n${assessment.slice(-4000)}\n\n` +
            "Give the verdict: 🟢 strong fit, 🟡 conditional fit, 🔴 pass.",
        },
      ],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const m = text.match(/(🟢|🟡|🔴)/);
    return m ? (m[1] as Judgment) : null;
  } catch (err) {
    log("DEBUG", "Verdict retry failed: %s", (err as Error).message);
    return null;
  }
}

export async function scoreJob(job: JobResult): Promise<ScoreResult> {
  const apiKey = process.env[ENV.ANTHROPIC_API_KEY];
  if (!apiKey) {
    log("WARN", "ANTHROPIC_API_KEY not set — skipping scoring");
    return { verdict: "?", reasoning: "" };
  }

  const jdText = await fetchJD(job.url);

  const userMessage = [
    `## Scoring Rubric\n${RUBRIC}`,
    `## Job`,
    `Company: ${job.company}`,
    `Title: ${job.title}`,
    job.location ? `Location: ${job.location}` : "",
    `URL: ${job.url}`,
    jdText ? `\n## Job Description\n${jdText}` : "",
    `\nScore each of the 14 dimensions with a brief 1-2 sentence assessment and numeric score.
Format each line as: N. Dimension Name: [score] — assessment
End with a blank line, then output EXACTLY this format (no markdown, no bold, no headers):
Verdict: 🟢
or
Verdict: 🟡
or
Verdict: 🔴`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: SCORING_MODEL,
      max_tokens: 2500,
      system:
        "You are a job scoring assistant for a VP Engineering / CTO candidate. Score each dimension and end with the verdict.",
      messages: [{ role: "user", content: userMessage }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    let verdict = parseVerdict(text);

    if (!verdict) {
      // The model sometimes trails off into a hedge ("...with a definitive
      // verdict.") instead of emitting the label. The assessment above it is
      // usually fine, so ask a second time for nothing but the label rather
      // than throwing the whole scoring away as "?".
      const verdictIdx = text.toLowerCase().lastIndexOf("verdict");
      const context =
        verdictIdx >= 0
          ? text.slice(Math.max(0, verdictIdx - 20), verdictIdx + 150)
          : text.slice(-300);
      log(
        "DEBUG",
        'No verdict in first pass for %s — %s (len=%s): "%s"',
        job.company,
        job.title,
        text.length,
        context,
      );
      verdict = await retryVerdict(client, text);
      if (!verdict) {
        log(
          "WARN",
          "Could not parse verdict for %s — %s even after retry (len=%s)",
          job.company,
          job.title,
          text.length,
        );
      }
    }

    return { verdict: verdict ?? "?", reasoning: text };
  } catch (err) {
    log(
      "WARN",
      "Scoring failed for %s — %s: %s",
      job.company,
      job.title,
      (err as Error).message,
    );
    return { verdict: "?", reasoning: "" };
  }
}

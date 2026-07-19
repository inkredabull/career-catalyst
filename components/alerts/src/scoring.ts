import Anthropic from "@anthropic-ai/sdk";
import { ENV } from "./config/settings";
import { JobResult } from "./linkedin";
import { log } from "./utils/logger";

// ---------------------------------------------------------------------------
// Rubric — kept in sync with components/scorer/src/scorer.ts
// ---------------------------------------------------------------------------

const RUBRIC = `
## 14-Dimension Scoring Rubric

### Primary dimensions (1–5 each, count toward total, max 40)
These are the direct pursue/pass drivers. Score honestly.
- 5 = Exceptional fit, exceeds bar
- 4 = Strong fit, clearly qualifies
- 3 = Adequate fit, some gaps or unknowns
- 2 = Weak fit, meaningful misalignment (🟡 Yellow flag)
- 1 = Poor fit or dealbreaker (🔴 Red flag)

1. Skills & Strengths Alignment — Does this role require AI-native systems, RAG, LLMs, platform/infra, or 0-to-1 building?
2. Role Availability & Growth — Clear mandate and upward path? CPTO/CTO+CPO compound titles with genuine authority score 4–5.
3. Values & Mission Fit — Does the company's mission connect to Anthony's long-term arc?
4. Compensation & Stability — Target: $225K+ base. Score 1 only if comp explicitly below $225K or equity-only. Undisclosed = score 2.
5. Company Culture Norms — Red flags: mandatory in-office, process-heavy bureaucracy in JD, recent layoffs. Don't penalize for size alone.
6. Lifestyle & Flexibility — Remote-friendly preferred; SF Bay Area in-person acceptable. Ambiguous on remote = score 2. Confirmed relocation required = score 1.
7. Personal Excitement & Curiosity — Would Anthony be energized by this problem space?
8. Internal Mobility — Could this role evolve into a true CTO mandate over time?

### Context dimensions (1–3 each, informational, max 18)
9.  Learning & Innovation
10. Network & Access
11. Leadership Reputation
12. Glassdoor / Employee Sentiment
13. Recent News / Growth Direction
14. Recruiter Responsiveness — Default 3 if not yet engaged.

Hard filters (score 1): comp below $225K, confirmed in-office outside SF Bay Area, IC-only, no AI/tech leadership mandate.
Soft filters (flag yellow if absent): React/Python/TypeScript stack, GCP, Series A–B or verified strong TC public co, prior exit on exec team.

Categorical Pass override: if the posting shows 100 or more applicants ("N applicants", "Over N applicants", "N people clicked apply"), the role is oversaturated — set the verdict to 🔴 Pass regardless of dimension scores.

Judgment labels (pick exactly one):
- 🟢 Strong Fit — Pursue Actively
- 🟡 Conditional Fit — Dig Deeper Before Committing
- 🔴 Pass — Meaningful Misalignment
`.trim();

// ---------------------------------------------------------------------------
// JD fetch — Jina Reader with ScrapingBee fallback
// ---------------------------------------------------------------------------

async function fetchViaJina(url: string): Promise<string> {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: { Accept: "text/plain" },
    signal: AbortSignal.timeout(8_000),
  });
  log("DEBUG", "Jina HTTP %s for %s", res.status, url.slice(0, 80));
  if (!res.ok) return "";
  const text = await res.text();
  // Treat DDoS/block responses as empty so we fall through to ScrapingBee
  if (
    text.toLowerCase().includes("ddos") ||
    text.toLowerCase().includes("blocked") ||
    text.length < 200
  ) {
    log("DEBUG", "Jina returned suspected block page, will try fallback");
    return "";
  }
  return text.slice(0, 12_000);
}

async function fetchViaScrapingBee(url: string): Promise<string> {
  const apiKey = process.env[ENV.SCRAPINGBEE_API_KEY];
  if (!apiKey) return "";
  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      url,
      render_js: "false",
      extract_rules: JSON.stringify({ body: "body" }),
    });
    const res = await fetch(`https://app.scrapingbee.com/api/v1?${params}`, {
      signal: AbortSignal.timeout(12_000),
    });
    log("DEBUG", "ScrapingBee HTTP %s for %s", res.status, url.slice(0, 80));
    if (!res.ok) return "";
    const text = await res.text();
    return text.slice(0, 12_000);
  } catch (err) {
    log("DEBUG", "ScrapingBee failed: %s", (err as Error).message);
    return "";
  }
}

async function fetchJD(url: string): Promise<string> {
  try {
    // LinkedIn consistently blocks Jina — skip straight to ScrapingBee
    if (!url.includes("linkedin.com")) {
      const jina = await fetchViaJina(url);
      if (jina) return jina;
      log("DEBUG", "Falling back to ScrapingBee for %s", url.slice(0, 80));
    } else {
      log(
        "DEBUG",
        "LinkedIn URL — using ScrapingBee directly for %s",
        url.slice(0, 80),
      );
    }
    return await fetchViaScrapingBee(url);
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
End with a blank line then: Verdict: [🟢 Strong Fit — Pursue Actively | 🟡 Conditional Fit — Dig Deeper Before Committing | 🔴 Pass — Meaningful Misalignment]`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2500,
      system:
        "You are a job scoring assistant for a VP Engineering / CTO candidate. Score each dimension and end with the verdict.",
      messages: [{ role: "user", content: userMessage }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const verdictMatch = text.match(/Verdict[^🟢🟡🔴\n]*[:\s]+(🟢|🟡|🔴)/i);
    let verdict: ScoreResult["verdict"] = "?";
    if (verdictMatch) {
      verdict = verdictMatch[1] as ScoreResult["verdict"];
    } else {
      log(
        "WARN",
        'Could not parse verdict for %s — %s: "%s"',
        job.company,
        job.title,
        text.slice(0, 100),
      );
    }

    return { verdict, reasoning: text };
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

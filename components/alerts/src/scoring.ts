import Anthropic from '@anthropic-ai/sdk';
import { ENV } from './config/settings';
import { JobResult } from './linkedin';
import { log } from './utils/logger';

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

Judgment labels (pick exactly one):
- 🟢 Strong Fit — Pursue Actively
- 🟡 Conditional Fit — Dig Deeper Before Committing
- 🔴 Pass — Meaningful Misalignment
`.trim();

// ---------------------------------------------------------------------------
// JD fetch via Jina Reader
// ---------------------------------------------------------------------------

async function fetchJD(url: string): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    return text.slice(0, 12_000);
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Scorer
// ---------------------------------------------------------------------------

export interface ScoreResult {
  verdict:   '🟢' | '🟡' | '🔴' | '?';
  reasoning: string;
}

export async function scoreJob(job: JobResult): Promise<ScoreResult> {
  const apiKey = process.env[ENV.ANTHROPIC_API_KEY];
  if (!apiKey) {
    log('WARN', 'ANTHROPIC_API_KEY not set — skipping scoring');
    return { verdict: '?', reasoning: '' };
  }

  const jdText = await fetchJD(job.url);

  const userMessage = [
    `## Scoring Rubric\n${RUBRIC}`,
    `## Job`,
    `Company: ${job.company}`,
    `Title: ${job.title}`,
    job.location ? `Location: ${job.location}` : '',
    `URL: ${job.url}`,
    jdText ? `\n## Job Description\n${jdText}` : '',
    `\nScore each of the 14 dimensions with a brief 1-2 sentence assessment and numeric score.
Format each line as: N. Dimension Name: [score] — assessment
End with a blank line then: Verdict: [🟢 Strong Fit — Pursue Actively | 🟡 Conditional Fit — Dig Deeper Before Committing | 🔴 Pass — Meaningful Misalignment]`,
  ].filter(Boolean).join('\n');

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: 'You are a job scoring assistant for a VP Engineering / CTO candidate. Score each dimension and end with the verdict.',
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    let verdict: ScoreResult['verdict'] = '?';
    if (text.includes('🟢')) verdict = '🟢';
    else if (text.includes('🟡')) verdict = '🟡';
    else if (text.includes('🔴')) verdict = '🔴';
    else log('WARN', 'Could not parse verdict for %s — %s: "%s"', job.company, job.title, text.slice(0, 100));

    return { verdict, reasoning: text };
  } catch (err) {
    log('WARN', 'Scoring failed for %s — %s: %s', job.company, job.title, (err as Error).message);
    return { verdict: '?', reasoning: '' };
  }
}

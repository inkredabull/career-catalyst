import { ProviderFactory } from '../providers/provider-factory';
import { LLMProviderConfig } from '../providers/llm-provider';

export interface JobBlurbs {
  firstPerson: string;
  thirdPerson: string;
}

export class BlurbGeneratorAgent {
  private config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.config = config;
  }

  async generate(job: { title: string; company: string; description: string }): Promise<JobBlurbs> {
    const provider = ProviderFactory.create(this.config);

    const prompt = `You are a professional career coach writing job application blurbs for a senior technology leader named Anthony.

Job Title: ${job.title}
Company: ${job.company}
Job Description (excerpt):
${job.description.slice(0, 2000)}

Generate two blurbs for Anthony based on this specific role and company. Rules:
- firstPerson: ≤ 280 characters (strict limit — count carefully)
- thirdPerson: 100-150 words
- Specific to this job and company (not generic)
- No clichés
- NO headings, labels, or titles before the text
- ONE continuous paragraph per blurb — no line breaks, no blank lines, no multiple paragraphs
- Start each blurb directly with the content (first word of the blurb, nothing before it)

Respond with ONLY valid JSON. The values must be plain prose strings with no embedded newlines:
{"firstPerson": "I ...", "thirdPerson": "Anthony ..."}`;

    const response = await provider.makeRequest({ prompt });

    // Strip markdown code fences if present
    const raw = response.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

    let parsed: JobBlurbs;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`BlurbGeneratorAgent: failed to parse JSON response. Raw:\n${response.text}`);
    }

    if (!parsed.firstPerson || !parsed.thirdPerson) {
      throw new Error('BlurbGeneratorAgent: response missing firstPerson or thirdPerson fields');
    }

    const flattenHeading = (s: string) =>
      s.replace(/^[A-Z][^\n]{0,40}\n/, '').replace(/\n+/g, ' ').trim();

    const truncateToChars = (s: string, limit: number): string => {
      if (s.length <= limit) return s;
      const cut = s.slice(0, limit);
      const lastSentenceEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
      return lastSentenceEnd > 0 ? cut.slice(0, lastSentenceEnd + 1) : cut.trimEnd();
    };

    const truncateToWords = (s: string, limit: number): string => {
      const words = s.split(/\s+/);
      if (words.length <= limit) return s;
      const truncated = words.slice(0, limit).join(' ');
      const lastSentenceEnd = Math.max(
        truncated.lastIndexOf('. '),
        truncated.lastIndexOf('! '),
        truncated.lastIndexOf('? ')
      );
      return lastSentenceEnd > 0 ? truncated.slice(0, lastSentenceEnd + 1) : truncated;
    };

    parsed.firstPerson = truncateToChars(flattenHeading(parsed.firstPerson), 280);
    parsed.thirdPerson = truncateToWords(flattenHeading(parsed.thirdPerson), 150);

    return parsed;
  }
}

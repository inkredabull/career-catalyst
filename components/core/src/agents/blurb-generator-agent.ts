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

Generate two blurbs for Anthony based on this specific role and company. Each blurb should be 100-150 words, specific to this job (not generic), and avoid clichés.

CRITICAL: Each blurb must be exactly ONE paragraph — no line breaks, no blank lines, no multiple paragraphs.

Respond with ONLY valid JSON in this exact format:
{
  "firstPerson": "<single paragraph, 100-150 words, using 'I', 'my', 'me' — written as an opening paragraph for a cover letter or elevator pitch. NO line breaks inside.>",
  "thirdPerson": "<single paragraph, 100-150 words, using 'Anthony' — written for a LinkedIn About section or recruiter summary. NO line breaks inside.>"
}`;

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

    // Collapse any stray line breaks the model may have inserted despite instructions
    parsed.firstPerson = parsed.firstPerson.replace(/\n+/g, ' ').trim();
    parsed.thirdPerson = parsed.thirdPerson.replace(/\n+/g, ' ').trim();

    return parsed;
  }
}

import Anthropic from '@anthropic-ai/sdk';
import { ClassificationResult } from '../types';

const CLASSIFIER_MODEL = 'claude-haiku-4-5-20251001';

const CLASSIFIER_SYSTEM_PROMPT = `You are a resume strategy classifier. Given a job posting and a brief CV summary, return ONLY a JSON object with these fields:
- domain: one of "regulated" | "enterprise" | "platform" | "general"
- format: "standard" if candidate has <4 relevant roles, otherwise "split"
- rolesIncluded: integer 3–6 based on relevance depth
- reasoning: 1–2 sentence explanation
- domainSignals: array of specific keywords detected in the job posting

Return ONLY the JSON object. No preamble, no markdown.`;

export class ResumeClassifierAgent {
  private anthropic: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = CLASSIFIER_MODEL) {
    this.anthropic = new Anthropic({ apiKey });
    this.model = model;
  }

  async classify(jobPosting: string, cvSummary: string): Promise<ClassificationResult> {
    const startTime = Date.now();
    console.log(`🔍 Classifying job posting with ${this.model}...`);

    let elapsedSeconds = 0;
    const timerInterval = setInterval(() => {
      elapsedSeconds++;
      process.stdout.write(`\r⏱️  Classifier elapsed: ${elapsedSeconds}s...`);
    }, 1000);

    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 512,
        system: CLASSIFIER_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Job Posting:\n${jobPosting}\n\nCV Summary (first 500 chars):\n${cvSummary.slice(0, 500)}`
        }]
      });

      clearInterval(timerInterval);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r⏱️  Classifier elapsed: ${duration}s (complete)\n`);

      const textBlock = response.content.find(b => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text content in classifier response');
      }

      const raw = textBlock.text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      const result: ClassificationResult = JSON.parse(raw);
      console.log(`✅ Classification: domain=${result.domain}, format=${result.format}, roles=${result.rolesIncluded}`);
      console.log(`   Signals: ${result.domainSignals.join(', ') || 'none'}`);
      return result;
    } catch (error) {
      clearInterval(timerInterval);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r⏱️  Classifier elapsed: ${duration}s (failed)\n`);
      throw new Error(`Classification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

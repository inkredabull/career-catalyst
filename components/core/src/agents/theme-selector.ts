import Anthropic from '@anthropic-ai/sdk';

const THEME_SELECTOR_MODEL = 'claude-haiku-4-5-20251001';

export interface ThemeSelectionResult {
  themes: string;
  primary: string;
}

const THEME_SELECTOR_SYSTEM_PROMPT = `You are a resume positioning strategist. Given a job posting and a brief CV summary, propose 2-4 priority themes/angles the resume should emphasize to position this candidate for this specific role.

Return ONLY a JSON object with these fields:
- themes: 2-4 short theme/angle lines, newline-separated (each a few words to a short phrase)
- primary: the single most important theme among them, as a short label (a few words)

Return ONLY the JSON object. No preamble, no markdown.`;

export class ThemeSelectorAgent {
  private anthropic: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = THEME_SELECTOR_MODEL) {
    this.anthropic = new Anthropic({ apiKey });
    this.model = model;
  }

  async selectThemes(jobPosting: string, cvSummary: string): Promise<ThemeSelectionResult> {
    const startTime = Date.now();
    console.log(`🎯 Selecting priority themes with ${this.model}...`);

    let elapsedSeconds = 0;
    const timerInterval = setInterval(() => {
      elapsedSeconds++;
      process.stdout.write(`\r⏱️  Theme selector elapsed: ${elapsedSeconds}s...`);
    }, 1000);

    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 512,
        system: THEME_SELECTOR_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Job Posting:\n${jobPosting}\n\nCV Summary (first 500 chars):\n${cvSummary.slice(0, 500)}`
        }]
      });

      clearInterval(timerInterval);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r⏱️  Theme selector elapsed: ${duration}s (complete)\n`);

      const textBlock = response.content.find(b => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text content in theme selector response');
      }

      const raw = textBlock.text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      const result: ThemeSelectionResult = JSON.parse(raw);
      console.log(`✅ Themes selected: primary="${result.primary}"`);
      return result;
    } catch (error) {
      clearInterval(timerInterval);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r⏱️  Theme selector elapsed: ${duration}s (failed)\n`);
      throw new Error(`Theme selection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

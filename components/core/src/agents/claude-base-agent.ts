import Anthropic from '@anthropic-ai/sdk';
import { ResumeResult } from '../types';

export abstract class ClaudeBaseAgent {
  protected anthropic: Anthropic;
  protected model: string;
  protected maxTokens: number;

  constructor(claudeApiKey: string, model: string = (process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'), maxTokens: number = 4000) {
    this.anthropic = new Anthropic({
      apiKey: claudeApiKey,
    });
    this.model = model;
    this.maxTokens = maxTokens;
  }

  protected async makeClaudeRequest(prompt: string, cachedContent?: string): Promise<string> {
    try {
      const startTime = Date.now();
      console.log(`🤖 Sending request to Claude (${this.model})${cachedContent ? ' with prompt caching' : ''}...`);

      // Start elapsed time display
      let elapsedSeconds = 0;
      const timerInterval = setInterval(() => {
        elapsedSeconds++;
        process.stdout.write(`\r⏱️  Elapsed time: ${elapsedSeconds}s...`);
      }, 1000);

      try {
        // Build content array with optional caching
        const content: Array<any> = [];

        if (cachedContent) {
          // Add cached content first (e.g., CV)
          content.push({
            type: 'text',
            text: cachedContent,
            cache_control: { type: 'ephemeral' }
          });
          // Add the prompt second
          content.push({
            type: 'text',
            text: prompt
          });
        } else {
          // Simple string prompt
          content.push({
            type: 'text',
            text: prompt
          });
        }

        const response = await this.anthropic.messages.create({
          model: this.model,
          max_tokens: this.maxTokens,
          messages: [
            {
              role: 'user',
              content: content.length === 1 && !cachedContent ? prompt : content,
            },
          ],
        });

        // Clear the timer and show final elapsed time
        clearInterval(timerInterval);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        process.stdout.write(`\r⏱️  Elapsed time: ${duration}s (complete)\n`);

        const inputTokens = response.usage.input_tokens;
        const outputTokens = response.usage.output_tokens;
        const cacheInfo = cachedContent && (response.usage as any).cache_creation_input_tokens
          ? ` (${(response.usage as any).cache_creation_input_tokens} cached)`
          : cachedContent && (response.usage as any).cache_read_input_tokens
          ? ` (${(response.usage as any).cache_read_input_tokens} from cache)`
          : '';
        console.log(`✅ Response received (${inputTokens} input tokens, ${outputTokens} output tokens${cacheInfo})`);

        // Extract text content from the response
        const textContent = response.content.find(block => block.type === 'text');
        const responseText = textContent?.text || '';

        // Debug: Log response if it's unexpectedly short
        if (outputTokens < 500) {
          console.log(`⚠️  Warning: Short response (${outputTokens} tokens). Response text: "${responseText.substring(0, 500)}"`);
        }

        return responseText;
      } catch (error) {
        // Make sure to clear interval on error too
        clearInterval(timerInterval);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        process.stdout.write(`\r⏱️  Elapsed time: ${duration}s (failed)\n`);
        throw error;
      }
    } catch (error) {
      throw new Error(`Claude API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  abstract createResume(jobId: string, cvFilePath: string, outputPath?: string, regenerate?: boolean, generate?: boolean | string, critique?: boolean, source?: 'cli' | 'programmatic'): Promise<ResumeResult>;
}

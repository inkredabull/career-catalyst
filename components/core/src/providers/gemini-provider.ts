import OpenAI from 'openai';
import { BaseLLMProvider, LLMProviderConfig, LLMRequest, LLMResponse, CostEstimate } from './llm-provider';

/**
 * Google Gemini provider — uses Google's OpenAI-compatible REST endpoint.
 * Free tier available via Google AI Studio (aistudio.google.com).
 * Default model: gemini-2.0-flash
 */
export class GeminiProvider extends BaseLLMProvider {
  private openai: OpenAI;

  constructor(config: LLMProviderConfig) {
    super(config);
    this.openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
    });
  }

  supportsPromptCaching(): boolean {
    return false;
  }

  async makeRequest(request: LLMRequest): Promise<LLMResponse> {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 15000; // 15s base — Gemini free tier RPM resets quickly

    const startTime = Date.now();
    console.log(`🤖 Sending request to Gemini (${this.config.model})...`);

    let elapsedSeconds = 0;
    const timerInterval = setInterval(() => {
      elapsedSeconds++;
      process.stdout.write(`\r⏱️  Elapsed time: ${elapsedSeconds}s...`);
    }, 1000);

    let fullPrompt = request.prompt;
    if (request.cachedContent) {
      fullPrompt = request.cachedContent + '\n\n' + request.prompt;
    }

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    messages.push({ role: 'user', content: fullPrompt });

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.openai.chat.completions.create({
          model: this.config.model,
          messages,
          max_tokens: this.config.maxTokens || 600,
          temperature: this.config.temperature || 0.7
        });

        clearInterval(timerInterval);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        process.stdout.write(`\r⏱️  Elapsed time: ${duration}s (complete)\n`);

        const usage = {
          inputTokens: response.usage?.prompt_tokens || 0,
          outputTokens: response.usage?.completion_tokens || 0,
          cachedTokens: 0
        };

        console.log(`✅ Gemini response received (${usage.inputTokens.toLocaleString()} in, ${usage.outputTokens.toLocaleString()} out) — free tier`);

        return {
          text: response.choices[0]?.message?.content || '',
          usage,
          cost: this.calculateActualCost(usage)
        };
      } catch (error) {
        const status = (error as any)?.status ?? (error as any)?.statusCode;
        const isRateLimit = status === 429;

        if (isRateLimit && attempt < MAX_RETRIES) {
          const waitMs = RETRY_DELAY_MS * attempt; // 15s, 30s
          process.stdout.write(`\r⏱️  Rate limited (429) — retrying in ${waitMs / 1000}s (attempt ${attempt}/${MAX_RETRIES - 1})...\n`);
          await new Promise(resolve => setTimeout(resolve, waitMs));
          continue;
        }

        clearInterval(timerInterval);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        process.stdout.write(`\r⏱️  Elapsed time: ${duration}s (failed)\n`);
        throw error;
      }
    }

    // Unreachable — loop always returns or throws
    throw new Error('Gemini request failed after max retries');
  }

  calculateActualCost(_usage: { inputTokens: number; outputTokens: number; cachedTokens?: number; cacheWriteTokens?: number }): {
    inputCost: number;
    outputCost: number;
    cachingSavings: number;
    totalCost: number;
  } {
    // Free tier — no cost
    return { inputCost: 0, outputCost: 0, cachingSavings: 0, totalCost: 0 };
  }

  estimateCost(_request: LLMRequest): CostEstimate {
    // Free tier — no cost
    return { inputCost: 0, outputCost: 0, cachingSavings: 0, totalCost: 0 };
  }
}

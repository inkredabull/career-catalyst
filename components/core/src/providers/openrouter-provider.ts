import OpenAI from 'openai';
import { BaseLLMProvider, LLMProviderConfig, LLMRequest, LLMResponse, CostEstimate } from './llm-provider';

/**
 * OpenRouter provider — OpenAI-compatible API that proxies many models.
 * Model IDs use "provider/model" format: e.g. "anthropic/claude-3.7-sonnet",
 * "google/gemini-1.5-flash", "mistralai/mistral-large-2407".
 * No native prompt caching (OpenRouter does not expose Anthropic cache headers).
 */
export class OpenRouterProvider extends BaseLLMProvider {
  private openai: OpenAI;

  constructor(config: LLMProviderConfig) {
    super(config);
    this.openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/inkredabull/career-catalyst',
        'X-Title': 'career-catalyst'
      }
    });
  }

  supportsPromptCaching(): boolean {
    return false;
  }

  async makeRequest(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    console.log(`🤖 Sending request to OpenRouter (${this.config.model})...`);

    let elapsedSeconds = 0;
    const timerInterval = setInterval(() => {
      elapsedSeconds++;
      process.stdout.write(`\r⏱️  Elapsed time: ${elapsedSeconds}s...`);
    }, 1000);

    try {
      let fullPrompt = request.prompt;
      if (request.cachedContent) {
        fullPrompt = request.cachedContent + '\n\n' + request.prompt;
      }

      const messages: any[] = [];
      if (request.systemPrompt) {
        messages.push({ role: 'system', content: request.systemPrompt });
      }
      messages.push({ role: 'user', content: fullPrompt });

      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages,
        max_tokens: this.config.maxTokens || 4000,
        temperature: this.config.temperature || 0.3
      });

      clearInterval(timerInterval);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r⏱️  Elapsed time: ${duration}s (complete)\n`);

      const usage = {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
        cachedTokens: 0
      };

      console.log(`✅ Response received (${usage.inputTokens.toLocaleString()} input tokens, ${usage.outputTokens.toLocaleString()} output tokens)`);

      return {
        text: response.choices[0]?.message?.content || '',
        usage,
        cost: this.calculateActualCost(usage)
      };
    } catch (error) {
      clearInterval(timerInterval);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r⏱️  Elapsed time: ${duration}s (failed)\n`);
      throw error;
    }
  }

  calculateActualCost(usage: { inputTokens: number; outputTokens: number; cachedTokens?: number; cacheWriteTokens?: number }): {
    inputCost: number;
    outputCost: number;
    cachingSavings: number;
    totalCost: number;
  } {
    const { inputPricePerMTok, outputPricePerMTok } = this.getPricing();
    const inputCost = (usage.inputTokens / 1_000_000) * inputPricePerMTok;
    const outputCost = (usage.outputTokens / 1_000_000) * outputPricePerMTok;
    return { inputCost, outputCost, cachingSavings: 0, totalCost: inputCost + outputCost };
  }

  estimateCost(request: LLMRequest): CostEstimate {
    const estimatedInputTokens = Math.ceil(
      (request.prompt.length + (request.cachedContent?.length || 0)) / 4
    );
    const estimatedOutputTokens = this.config.maxTokens || 4000;
    const { inputPricePerMTok, outputPricePerMTok } = this.getPricing();
    const inputCost = (estimatedInputTokens / 1_000_000) * inputPricePerMTok;
    const outputCost = (estimatedOutputTokens / 1_000_000) * outputPricePerMTok;
    return { inputCost, outputCost, cachingSavings: 0, totalCost: inputCost + outputCost };
  }

  /** Approximate pricing by model family. OpenRouter adds ~5–10% margin on top. */
  private getPricing(): { inputPricePerMTok: number; outputPricePerMTok: number } {
    const model = this.config.model.toLowerCase();

    if (model.includes('claude-3.7') || model.includes('claude-3-7')) {
      return { inputPricePerMTok: 3.0, outputPricePerMTok: 15.0 };
    }
    if (model.includes('claude-3.5') || model.includes('claude-3-5')) {
      return { inputPricePerMTok: 3.0, outputPricePerMTok: 15.0 };
    }
    if (model.includes('claude') && model.includes('haiku')) {
      return { inputPricePerMTok: 0.25, outputPricePerMTok: 1.25 };
    }
    if (model.includes('gemini-1.5-flash')) {
      return { inputPricePerMTok: 0.075, outputPricePerMTok: 0.30 };
    }
    if (model.includes('gemini-1.5-pro')) {
      return { inputPricePerMTok: 3.5, outputPricePerMTok: 10.5 };
    }
    if (model.includes('gpt-4o-mini')) {
      return { inputPricePerMTok: 0.15, outputPricePerMTok: 0.60 };
    }
    if (model.includes('gpt-4o')) {
      return { inputPricePerMTok: 2.50, outputPricePerMTok: 10.0 };
    }
    if (model.includes('mistral-large')) {
      return { inputPricePerMTok: 3.0, outputPricePerMTok: 9.0 };
    }
    if (model.includes('command-r-plus')) {
      return { inputPricePerMTok: 3.0, outputPricePerMTok: 15.0 };
    }

    // Conservative fallback
    return { inputPricePerMTok: 3.0, outputPricePerMTok: 15.0 };
  }
}

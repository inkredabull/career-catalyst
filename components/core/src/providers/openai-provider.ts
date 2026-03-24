import OpenAI from 'openai';
import { BaseLLMProvider, LLMProviderConfig, LLMRequest, LLMResponse, CostEstimate } from './llm-provider';

export class OpenAIProvider extends BaseLLMProvider {
  private openai: OpenAI;

  constructor(config: LLMProviderConfig) {
    super(config);
    this.openai = new OpenAI({ apiKey: config.apiKey });
  }

  supportsPromptCaching(): boolean {
    return false; // OpenAI doesn't support explicit prompt caching
  }

  async makeRequest(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    console.log(`🤖 Sending request to OpenAI (${this.config.model})...`);

    // Start elapsed time display
    let elapsedSeconds = 0;
    const timerInterval = setInterval(() => {
      elapsedSeconds++;
      process.stdout.write(`\r⏱️  Elapsed time: ${elapsedSeconds}s...`);
    }, 1000);

    try {
      // Concatenate cached content with prompt (no special caching)
      let fullPrompt = request.prompt;
      if (request.cachedContent) {
        fullPrompt = request.cachedContent + '\n\n' + request.prompt;
      }

      const messages: any[] = [];

      if (request.systemPrompt) {
        messages.push({ role: 'system', content: request.systemPrompt });
      }

      messages.push({ role: 'user', content: fullPrompt });

      // GPT-4o and newer models (including GPT-5) use max_completion_tokens
      // Older models use max_tokens
      const usesNewTokenParam = this.config.model.includes('gpt-4o') ||
                                 this.config.model.includes('gpt-5') ||
                                 this.config.model.includes('o1') ||
                                 this.config.model.includes('o3');

      const requestParams: any = {
        model: this.config.model,
        messages,
        temperature: this.config.temperature || 0.3
      };

      if (usesNewTokenParam) {
        requestParams.max_completion_tokens = this.config.maxTokens || 4000;
      } else {
        requestParams.max_tokens = this.config.maxTokens || 4000;
      }

      const response = await this.openai.chat.completions.create(requestParams);

      // Clear the timer and show final elapsed time
      clearInterval(timerInterval);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r⏱️  Elapsed time: ${duration}s (complete)\n`);

      const usage = {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
        cachedTokens: 0 // OpenAI doesn't expose cache info
      };

      // Log usage info
      console.log(`✅ Response received (${usage.inputTokens.toLocaleString()} input tokens, ${usage.outputTokens.toLocaleString()} output tokens)`);

      return {
        text: response.choices[0]?.message?.content || '',
        usage,
        cost: this.calculateActualCost(usage)
      };
    } catch (error) {
      // Make sure to clear interval on error too
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
    // Pricing varies by model
    // GPT-4o: $2.50/MTok input, $10/MTok output
    // GPT-4o-mini: $0.15/MTok input, $0.60/MTok output
    // GPT-5: estimate higher pricing
    let inputPricePerMTok = 2.50;
    let outputPricePerMTok = 10;

    if (this.config.model.includes('mini')) {
      inputPricePerMTok = 0.15;
      outputPricePerMTok = 0.60;
    } else if (this.config.model.startsWith('gpt-5')) {
      inputPricePerMTok = 5;
      outputPricePerMTok = 20;
    }

    const inputCost = (usage.inputTokens / 1_000_000) * inputPricePerMTok;
    const outputCost = (usage.outputTokens / 1_000_000) * outputPricePerMTok;

    return {
      inputCost,
      outputCost,
      cachingSavings: 0, // No caching support
      totalCost: inputCost + outputCost
    };
  }

  estimateCost(request: LLMRequest): CostEstimate {
    // Rough token count estimation
    const estimatedInputTokens = Math.ceil((request.prompt.length + (request.cachedContent?.length || 0)) / 4);
    const estimatedOutputTokens = this.config.maxTokens || 4000;

    // Pricing varies by model - use conservative estimates
    // GPT-4o: $2.50/MTok input, $10/MTok output
    // GPT-4o-mini: $0.15/MTok input, $0.60/MTok output
    // Unknown models: assume GPT-4o pricing
    let inputPricePerMTok = 2.50;
    let outputPricePerMTok = 10;

    if (this.config.model.includes('mini')) {
      inputPricePerMTok = 0.15;
      outputPricePerMTok = 0.60;
    } else if (this.config.model.startsWith('gpt-5')) {
      // Future GPT-5 models - estimate higher pricing
      inputPricePerMTok = 5;
      outputPricePerMTok = 20;
    }

    const inputCost = (estimatedInputTokens / 1_000_000) * inputPricePerMTok;
    const outputCost = (estimatedOutputTokens / 1_000_000) * outputPricePerMTok;

    return {
      inputCost,
      outputCost,
      cachingSavings: 0, // No caching support
      totalCost: inputCost + outputCost
    };
  }
}

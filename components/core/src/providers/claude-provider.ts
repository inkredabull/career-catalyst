import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMProvider, LLMProviderConfig, LLMRequest, LLMResponse, CostEstimate } from './llm-provider';

export class ClaudeProvider extends BaseLLMProvider {
  private anthropic: Anthropic;

  constructor(config: LLMProviderConfig) {
    super(config);
    this.anthropic = new Anthropic({ apiKey: config.apiKey });
  }

  supportsPromptCaching(): boolean {
    return true;
  }

  async makeRequest(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    console.log(`🤖 Sending request to Claude (${this.config.model})${request.cachedContent ? ' with prompt caching' : ''}...`);

    // Start elapsed time display
    let elapsedSeconds = 0;
    const timerInterval = setInterval(() => {
      elapsedSeconds++;
      process.stdout.write(`\r⏱️  Elapsed time: ${elapsedSeconds}s...`);
    }, 1000);

    try {
      const content: Array<any> = [];

      // Use prompt caching for CV content if supported
      if (request.cachedContent && this.supportsPromptCaching()) {
        content.push({
          type: 'text',
          text: request.cachedContent,
          cache_control: { type: 'ephemeral' }
        });
      }

      content.push({ type: 'text', text: request.prompt });

      const response = await this.anthropic.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens || 4000,
        messages: [{
          role: 'user',
          content: content.length === 1 ? request.prompt : content
        }]
      });

      // Clear the timer and show final elapsed time
      clearInterval(timerInterval);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r⏱️  Elapsed time: ${duration}s (complete)\n`);

      const textContent = response.content.find(b => b.type === 'text');

      const usage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cachedTokens: (response.usage as any).cache_read_input_tokens || 0,
        cacheWriteTokens: (response.usage as any).cache_creation_input_tokens || 0
      };

      // Log usage info
      const cacheInfo = usage.cachedTokens > 0
        ? ` (${usage.cachedTokens.toLocaleString()} from cache)`
        : usage.cacheWriteTokens > 0
          ? ` (${usage.cacheWriteTokens.toLocaleString()} written to cache)`
          : '';
      console.log(`✅ Response received (${usage.inputTokens.toLocaleString()} input tokens, ${usage.outputTokens.toLocaleString()} output tokens${cacheInfo})`);

      return {
        text: textContent?.text || '',
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
    // Claude Sonnet pricing: $3/MTok input, $15/MTok output
    // Claude Haiku pricing: $0.25/MTok input, $1.25/MTok output
    // Cache reads: 10% of input cost (90% savings)
    // Cache writes: 125% of input cost
    const inputPricePerMTok = this.config.model.includes('haiku') ? 0.25 : 3;
    const outputPricePerMTok = this.config.model.includes('haiku') ? 1.25 : 15;
    const cacheReadPricePerMTok = inputPricePerMTok * 0.1;
    const cacheWritePricePerMTok = inputPricePerMTok * 1.25;

    // inputTokens = non-cached dynamic tokens (separate from cached/write tokens)
    const regularInputCost = (usage.inputTokens / 1_000_000) * inputPricePerMTok;
    const cacheReadCost = ((usage.cachedTokens || 0) / 1_000_000) * cacheReadPricePerMTok;
    const cacheWriteCost = ((usage.cacheWriteTokens || 0) / 1_000_000) * cacheWritePricePerMTok;
    const outputCost = (usage.outputTokens / 1_000_000) * outputPricePerMTok;

    // Savings = what cache-read tokens would have cost at full rate vs discounted rate
    const cachingSavings = ((usage.cachedTokens || 0) / 1_000_000) * (inputPricePerMTok - cacheReadPricePerMTok);

    return {
      inputCost: regularInputCost + cacheReadCost + cacheWriteCost,
      outputCost,
      cachingSavings,
      totalCost: regularInputCost + cacheReadCost + cacheWriteCost + outputCost
    };
  }

  estimateCost(request: LLMRequest): CostEstimate {
    // Rough token count estimation
    const estimatedInputTokens = Math.ceil((request.prompt.length + (request.cachedContent?.length || 0)) / 4);
    const estimatedOutputTokens = this.config.maxTokens || 4000;

    // Claude Sonnet pricing: $3/MTok input, $15/MTok output
    // Claude Haiku pricing: $0.25/MTok input, $1.25/MTok output
    // Assume Sonnet-like pricing for unknown models
    const inputPricePerMTok = this.config.model.includes('haiku') ? 0.25 : 3;
    const outputPricePerMTok = this.config.model.includes('haiku') ? 1.25 : 15;

    const inputCost = (estimatedInputTokens / 1_000_000) * inputPricePerMTok;
    const outputCost = (estimatedOutputTokens / 1_000_000) * outputPricePerMTok;

    // Caching reduces input cost by 90%
    const cachingSavings = request.cachedContent ? inputCost * 0.9 : 0;

    return {
      inputCost,
      outputCost,
      cachingSavings,
      totalCost: inputCost + outputCost - cachingSavings
    };
  }
}

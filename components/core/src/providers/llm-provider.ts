export type LLMProvider = 'anthropic' | 'openai' | 'openrouter';
export type ModelTier = 'fast' | 'quality';

export interface LLMProviderConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string; // Explicit model (e.g., 'gpt-5.2-2025-12-11')
  maxTokens?: number;
  temperature?: number;
}

export interface LLMRequest {
  prompt: string;
  cachedContent?: string; // For providers that support caching
  systemPrompt?: string;
}

export interface LLMResponse {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedTokens?: number; // Only populated if caching was used
  };
  cost: {
    inputCost: number;
    outputCost: number;
    cachingSavings: number;
    totalCost: number;
  };
}

export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  cachingSavings: number; // Will be 0 for OpenAI
  totalCost: number;
}

export abstract class BaseLLMProvider {
  protected config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.config = config;
  }

  abstract makeRequest(request: LLMRequest): Promise<LLMResponse>;
  abstract supportsPromptCaching(): boolean;
  abstract estimateCost(request: LLMRequest): CostEstimate;
  abstract calculateActualCost(usage: { inputTokens: number; outputTokens: number; cachedTokens?: number }): {
    inputCost: number;
    outputCost: number;
    cachingSavings: number;
    totalCost: number;
  };

  getProviderName(): string {
    return this.config.provider;
  }

  getModelName(): string {
    return this.config.model;
  }
}

export type LLMProvider = 'anthropic' | 'openai' | 'openrouter' | 'gemini' | 'bedrock';
export type ModelTier = 'fast' | 'quality';

export interface LLMProviderConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string; // Explicit model (e.g., 'gpt-5.2-2025-12-11')
  maxTokens?: number;
  temperature?: number;
  /** AWS region for Bedrock (defaults to AWS_REGION or us-east-1) */
  region?: string;
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
    cachedTokens?: number;      // Cache READ tokens (billed at 10% of input rate)
    cacheWriteTokens?: number;  // Cache WRITE tokens (billed at 125% of input rate)
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
  abstract calculateActualCost(usage: { inputTokens: number; outputTokens: number; cachedTokens?: number; cacheWriteTokens?: number }): {
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

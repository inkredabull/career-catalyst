/**
 * AI Service - Main service for AI operations using OpenRouter
 *
 * @module ai/AIService
 */

import { CONFIG } from '../config';
import { Logger } from '../utils/Logger';
import { ConfigService } from '../data/ConfigService';
import { ModelDiscoveryService } from '../data/ModelDiscoveryService';
import { OpenRouterProvider } from './OpenRouterProvider';

/**
 * Query options for AI service
 */
export interface QueryOptions {
  provider?: string;
  maxTokens?: number;
}

/**
 * AI Service using OpenRouter for unified model access
 */
export class AIService {
  private configService: ConfigService;
  private provider: OpenRouterProvider;
  private discovery: ModelDiscoveryService;
  private defaultModel: string;
  private modelMap: Record<string, string>;

  /**
   * Create an AI service
   * @param configService - Configuration service
   */
  constructor(configService: ConfigService) {
    this.configService = configService;
    const apiKey = this.configService.getAPIKey('OPENROUTER');
    this.provider = new OpenRouterProvider(apiKey);
    this.discovery = new ModelDiscoveryService(apiKey);
    this.defaultModel = 'claude';

    // Discover latest models dynamically
    this.modelMap = this.discoverModels();

    Logger.log('AIService initialized with models:', JSON.stringify(this.modelMap));
  }

  /**
   * Discover and cache latest models from OpenRouter
   * @returns Model map {claude: 'id', gemini: 'id', openai: 'id', mistral: 'id', cohere: 'id', llama: 'id'}
   */
  discoverModels(): Record<string, string> {
    try {
      const discovered = this.discovery.getModels();
      return {
        claude: discovered.CLAUDE,
        gemini: discovered.GEMINI,
        openai: discovered.OPENAI,
        mistral: discovered.MISTRAL,
        cohere: discovered.COHERE,
        llama: discovered.LLAMA,
      };
    } catch (error) {
      Logger.warn(`Model discovery failed, using fallbacks: ${(error as Error).message}`);
      return {
        claude: CONFIG.AI.FALLBACK_MODELS.CLAUDE,
        gemini: CONFIG.AI.FALLBACK_MODELS.GEMINI,
        openai: CONFIG.AI.FALLBACK_MODELS.OPENAI,
        mistral: CONFIG.AI.FALLBACK_MODELS.MISTRAL,
        cohere: CONFIG.AI.FALLBACK_MODELS.COHERE,
        llama: CONFIG.AI.FALLBACK_MODELS.LLAMA,
      };
    }
  }

  /**
   * Refresh models from OpenRouter (force cache refresh)
   * @returns Updated model map
   */
  refreshModels(): Record<string, string> {
    try {
      const discovered = this.discovery.refreshModels();
      this.modelMap = {
        claude: discovered.CLAUDE,
        gemini: discovered.GEMINI,
        openai: discovered.OPENAI,
        mistral: discovered.MISTRAL,
        cohere: discovered.COHERE,
        llama: discovered.LLAMA,
      };
      Logger.log('Models refreshed:', JSON.stringify(this.modelMap));
      return this.modelMap;
    } catch (error) {
      Logger.error(`Model refresh failed: ${(error as Error).message}`);
      return this.modelMap; // Keep existing models
    }
  }

  /**
   * Query an AI model via OpenRouter
   * @param prompt - Prompt text
   * @param options - Query options {provider: string, maxTokens: number}
   * @returns AI response
   */
  query(prompt: string, options: QueryOptions = {}): string {
    const { provider = this.defaultModel, maxTokens = 1000 } = options;

    const modelName = this.modelMap[provider];
    if (!modelName) {
      throw new Error(`Model "${provider}" not available. Valid options: claude, gemini, openai`);
    }

    Logger.log(`Querying ${modelName} via OpenRouter with maxTokens: ${maxTokens}`);
    return this.provider.queryWithModel(prompt, maxTokens, modelName);
  }

  /**
   * Set default model
   * @param provider - Model name ('claude', 'gemini', 'openai')
   */
  setDefaultProvider(provider: string): void {
    if (!this.modelMap[provider]) {
      throw new Error(`Model "${provider}" not available`);
    }
    this.defaultModel = provider;
  }
}

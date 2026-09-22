/**
 * AI Service - Main service for AI operations using OpenRouter
 *
 * @module ai/AIService
 */
import { ConfigService } from '../data/ConfigService';
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
export declare class AIService {
    private configService;
    private provider;
    private discovery;
    private defaultModel;
    private modelMap;
    /**
     * Create an AI service
     * @param configService - Configuration service
     */
    constructor(configService: ConfigService);
    /**
     * Discover and cache latest models from OpenRouter
     * @returns Model map {claude: 'id', gemini: 'id', openai: 'id', mistral: 'id', cohere: 'id', llama: 'id'}
     */
    discoverModels(): Record<string, string>;
    /**
     * Refresh models from OpenRouter (force cache refresh)
     * @returns Updated model map
     */
    refreshModels(): Record<string, string>;
    /**
     * Query an AI model via OpenRouter
     * @param prompt - Prompt text
     * @param options - Query options {provider: string, maxTokens: number}
     * @returns AI response
     */
    query(prompt: string, options?: QueryOptions): string;
    /**
     * Set default model
     * @param provider - Model name ('claude', 'gemini', 'openai')
     */
    setDefaultProvider(provider: string): void;
}
//# sourceMappingURL=AIService.d.ts.map
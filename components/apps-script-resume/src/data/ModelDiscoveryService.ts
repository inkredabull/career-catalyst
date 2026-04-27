/**
 * Model Discovery Service - Discovers and caches latest AI models from OpenRouter
 *
 * @module data/ModelDiscoveryService
 */

import { CONFIG } from '../config';
import { Logger } from '../utils/Logger';

/**
 * Model information from OpenRouter API
 */
export interface ModelInfo {
  id: string;
  context_length?: number;
  [key: string]: unknown;
}

/**
 * Model map for different providers
 */
export interface ModelMap {
  CLAUDE: string;
  GEMINI: string;
  OPENAI: string;
  MISTRAL: string;
  COHERE: string;
}

/**
 * Service for discovering and caching latest AI models from OpenRouter
 */
export class ModelDiscoveryService {
  private apiKey: string;
  private cacheKey: string;
  private timestampKey: string;

  /**
   * Create a ModelDiscoveryService
   * @param apiKey - OpenRouter API key
   */
  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.cacheKey = 'OPENROUTER_MODELS_CACHE';
    this.timestampKey = 'OPENROUTER_MODELS_TIMESTAMP';
  }

  /**
   * Get cached models or fetch fresh ones
   * @returns Model map {claude: 'id', gemini: 'id', openai: 'id'}
   */
  getModels(): ModelMap {
    try {
      // Check cache first
      const cached = this._getCachedModels();
      if (cached) {
        Logger.log('Using cached models');
        return cached;
      }

      // Fetch fresh models
      Logger.log('Fetching latest models from OpenRouter...');
      const models = this._fetchModels();

      // Cache them
      this._cacheModels(models);

      return models;
    } catch (error) {
      Logger.error('Model discovery failed, using fallbacks', error as Error);
      return CONFIG.AI.FALLBACK_MODELS;
    }
  }

  /**
   * Force refresh models from API
   * @returns Model map
   */
  refreshModels(): ModelMap {
    try {
      const models = this._fetchModels();
      this._cacheModels(models);
      Logger.log('Models refreshed successfully');
      return models;
    } catch (error) {
      Logger.error('Model refresh failed', error as Error);
      return CONFIG.AI.FALLBACK_MODELS;
    }
  }

  /**
   * Get cached models if still valid
   * @returns Cached models or null
   * @private
   */
  private _getCachedModels(): ModelMap | null {
    const props = PropertiesService.getScriptProperties();
    const cachedJson = props.getProperty(this.cacheKey);
    const timestamp = props.getProperty(this.timestampKey);

    if (!cachedJson || !timestamp) {
      return null;
    }

    // Check if cache is expired
    const cacheAge = Date.now() - parseInt(timestamp);
    const maxAge = CONFIG.AI.DISCOVERY.CACHE_DURATION_HOURS * 60 * 60 * 1000;

    if (cacheAge > maxAge) {
      Logger.log('Model cache expired');
      return null;
    }

    return JSON.parse(cachedJson) as ModelMap;
  }

  /**
   * Cache models with timestamp
   * @param models - Models to cache
   * @private
   */
  private _cacheModels(models: ModelMap): void {
    const props = PropertiesService.getScriptProperties();
    props.setProperty(this.cacheKey, JSON.stringify(models));
    props.setProperty(this.timestampKey, Date.now().toString());
  }

  /**
   * Fetch models from OpenRouter API
   * @returns Model map
   * @private
   */
  private _fetchModels(): ModelMap {
    const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
      method: 'get',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch(CONFIG.AI.MODELS_ENDPOINT, options);

    if (response.getResponseCode() !== 200) {
      throw new Error('Failed to fetch models: ' + response.getContentText());
    }

    const data = JSON.parse(response.getContentText()) as { data: ModelInfo[] };
    return this._selectBestModels(data.data);
  }

  /**
   * Select best model for each provider
   * @param models - Array of model objects from API
   * @returns Model map
   * @private
   */
  private _selectBestModels(models: ModelInfo[]): ModelMap {
    const providers: Record<string, ModelInfo | null> = {
      anthropic: null,
      google: null,
      openai: null,
      mistralai: null,
      cohere: null,
    };

    models.forEach((model) => {
      const modelId = model.id;
      const provider = modelId.split('/')[0];

      // Skip if provider is undefined or not one of our target providers
      if (!provider || !Object.prototype.hasOwnProperty.call(providers, provider)) {
        return;
      }

      // Filter criteria
      const contextLength = model.context_length || 0;
      const isChat =
        modelId.includes('chat') ||
        modelId.includes('sonnet') ||
        modelId.includes('flash') ||
        modelId.includes('gpt') ||
        modelId.includes('mistral') ||
        modelId.includes('command');

      // Must meet minimum context requirement
      if (contextLength < CONFIG.AI.DISCOVERY.MIN_CONTEXT) {
        return;
      }

      // Must be a chat/text model (not image, audio, etc.)
      if (!isChat) {
        return;
      }

      // Select if we don't have one yet, or this is "better"
      if (!providers[provider]) {
        providers[provider] = model;
      } else {
        // Prefer models with:
        // 1. More recent (if we can detect)
        // 2. Larger context window
        // 3. Known flagship models (sonnet, flash, gpt-4)
        const current = providers[provider];

        const isNewerGeneration = this._compareModelGenerations(modelId, current.id);
        const hasMoreContext = contextLength > (current.context_length || 0);

        if (isNewerGeneration || hasMoreContext) {
          providers[provider] = model;
        }
      }
    });

    // Build result map
    const result: ModelMap = {
      CLAUDE: providers['anthropic']?.id || CONFIG.AI.FALLBACK_MODELS.CLAUDE,
      GEMINI: providers['google']?.id || CONFIG.AI.FALLBACK_MODELS.GEMINI,
      OPENAI: providers['openai']?.id || CONFIG.AI.FALLBACK_MODELS.OPENAI,
      MISTRAL: providers['mistralai']?.id || CONFIG.AI.FALLBACK_MODELS.MISTRAL,
      COHERE: providers['cohere']?.id || CONFIG.AI.FALLBACK_MODELS.COHERE,
    };

    Logger.log('Selected models:', JSON.stringify(result));
    return result;
  }

  /**
   * Compare model generations (basic heuristic)
   * @param model1 - Model ID 1
   * @param model2 - Model ID 2
   * @returns True if model1 is newer
   * @private
   */
  private _compareModelGenerations(model1: string, model2: string): boolean {
    // Look for version numbers
    const extractVersion = (id: string): number => {
      const match = id.match(/(\d+\.?\d*)/);
      return match && match[1] ? parseFloat(match[1]) : 0;
    };

    const v1 = extractVersion(model1);
    const v2 = extractVersion(model2);

    // Prefer known flagship models
    const isFlagship = (id: string): boolean => {
      return (
        id.includes('sonnet') ||
        id.includes('opus') ||
        id.includes('gpt-4') ||
        id.includes('gpt-5') ||
        id.includes('flash') ||
        id.includes('large') ||
        id.includes('v3')
      );
    };

    if (isFlagship(model1) && !isFlagship(model2)) return true;
    if (!isFlagship(model1) && isFlagship(model2)) return false;

    return v1 > v2;
  }
}

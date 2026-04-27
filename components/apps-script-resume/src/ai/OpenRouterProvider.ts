/**
 * OpenRouter Provider - Unified AI provider via OpenRouter API
 *
 * @module ai/OpenRouterProvider
 */

import { CONFIG } from '../config';
import { Logger } from '../utils/Logger';
import { AIProviderBase } from './AIProviderBase';

/**
 * OpenRouter unified AI provider
 * Access to Claude, Gemini, OpenAI, Mistral, Cohere, and 200+ models through single API
 */
export class OpenRouterProvider extends AIProviderBase {
  /**
   * Create an OpenRouter provider
   * @param apiKey - OpenRouter API key
   */
  constructor(apiKey: string) {
    super(apiKey, '', 'openrouter');
  }

  /**
   * Get OpenRouter API endpoint
   * @returns Endpoint URL
   */
  getEndpoint(): string {
    return CONFIG.AI.ENDPOINT;
  }

  /**
   * Generate OpenRouter request payload
   * @param prompt - Prompt text
   * @param maxTokens - Maximum output tokens
   * @param modelName - Model identifier (e.g., 'anthropic/claude-3.7-sonnet')
   * @returns Request payload
   */
  generatePayload(prompt: string, maxTokens: number, modelName?: string): Record<string, unknown> {
    return {
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
    };
  }

  /**
   * Generate OpenRouter authentication headers
   * @returns Headers object
   */
  generateAuthHeader(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'HTTP-Referer': 'https://sheets.google.com', // For OpenRouter rankings
      'X-Title': 'Resume Achievement Generator', // For OpenRouter rankings
    };
  }

  /**
   * Parse OpenRouter response
   * @param response - HTTP response
   * @returns Extracted text
   */
  parseResponse(response: GoogleAppsScript.URL_Fetch.HTTPResponse): string {
    const json = JSON.parse(response.getContentText()) as {
      error?: { message?: string; code?: string | number };
      choices?: Array<{
        message?: {
          content?: string | Array<{ type: string; text?: string }> | null;
          reasoning?: string;
        };
        finish_reason?: string;
      }>;
    };

    // Log full response for debugging
    Logger.log('OpenRouter response JSON:', JSON.stringify(json));

    // Surface provider-level errors returned with HTTP 200
    if (json.error) {
      const msg = json.error.message || JSON.stringify(json.error);
      Logger.error('OpenRouter provider error:', msg);
      throw new Error(`Provider error: ${msg}`);
    }

    // Check if response has expected structure
    if (!json.choices || json.choices.length === 0) {
      Logger.error('No choices in response:', JSON.stringify(json));
      throw new Error('Invalid response: no choices array');
    }

    const choice = json.choices[0];
    const message = choice?.message;
    const finishReason = choice?.finish_reason;

    // Normalise content — newer models may return an array of content blocks
    const rawContent = message?.content;
    let content = '';
    if (Array.isArray(rawContent)) {
      content = rawContent
        .filter((b) => b.type === 'text' && b.text)
        .map((b) => b.text)
        .join('');
    } else {
      content = rawContent || '';
    }

    const reasoning = message?.reasoning || '';

    if (reasoning) {
      Logger.log(`Model reasoning detected (${reasoning.length} chars)`);
    }

    if (!content || content.trim().length === 0) {
      if (finishReason === 'length' && reasoning) {
        Logger.error('Reasoning model hit token limit before producing final answer');
        Logger.error(`Reasoning length: ${reasoning.length} chars`);
        throw new Error(
          'Model used all tokens for reasoning and did not produce final answer. Increase REASONING_MULTIPLIER.'
        );
      } else if (reasoning) {
        Logger.error('Model produced reasoning but no final content');
        throw new Error('Model produced reasoning but no final answer in content field');
      } else {
        Logger.error('Empty content, finish_reason=' + finishReason, JSON.stringify(message));
        throw new Error(
          `Invalid response: no content (finish_reason=${finishReason ?? 'unknown'})`
        );
      }
    }

    return content.trim();
  }

  /**
   * Query OpenRouter with specific model
   * @param prompt - Prompt text
   * @param maxTokens - Maximum output tokens
   * @param modelName - Model identifier
   * @returns AI response
   */
  queryWithModel(prompt: string, maxTokens: number, modelName: string): string {
    try {
      const payload = this.generatePayload(prompt, maxTokens, modelName);
      const headers = this.generateAuthHeader();
      const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
        method: 'post',
        headers: headers,
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
        contentType: 'application/json',
      };

      const url = this.getEndpoint();
      const response = UrlFetchApp.fetch(url, options);

      if (response.getResponseCode() === 200) {
        const result = this.parseResponse(response);
        Logger.log(`OpenRouter response (${modelName}): ${result.length} chars`);
        return result;
      } else {
        const errorText = response.getContentText();
        Logger.error(`OpenRouter query failed: ${errorText}`);
        throw new Error(errorText);
      }
    } catch (error) {
      Logger.error(`OpenRouter query failed: ${(error as Error).message}`, error as Error);
      throw error;
    }
  }
}

/**
 * Achievement Service - Generates achievements from CAR (Challenge-Action-Result)
 *
 * @module business/AchievementService
 */

import { CONFIG } from '../config';
import { Logger } from '../utils/Logger';
import { TextUtils } from '../utils/TextUtils';
import { AIService } from '../ai/AIService';

/**
 * Service for generating achievements from CAR (Challenge-Action-Result)
 */
export class AchievementService {
  private aiService: AIService;

  /**
   * Create an AchievementService
   * @param aiService - AI service instance
   */
  constructor(aiService: AIService) {
    this.aiService = aiService;
  }

  /**
   * Generate achievement from Challenge, Actions, and Result
   * @param challenge - The challenge faced
   * @param actions - Actions taken
   * @param result - Result achieved
   * @param client - Whether this was client work
   * @param targetAudience - Target audience ('cv' or 'linkedin')
   * @returns Generated achievement
   */
  generateAchievement(
    challenge: string,
    actions: string,
    result: string,
    client: boolean = false,
    targetAudience: string = 'cv'
  ): string {
    const prompt = this._buildPrompt(challenge, actions, result, client, targetAudience);

    // Select appropriate max_tokens based on target audience
    const maxTokens =
      targetAudience === 'linkedin'
        ? CONFIG.AI.MAX_TOKENS.ACHIEVEMENT_LINKEDIN
        : CONFIG.AI.MAX_TOKENS.ACHIEVEMENT_CV;

    Logger.log(`Generating achievement for ${targetAudience} with maxTokens: ${maxTokens}`);
    Logger.log(prompt);

    const output = this.aiService.query(prompt, {
      maxTokens: maxTokens,
      provider: 'claude',
    });
    Logger.log('OUTPUT:', output.length, 'chars');
    return output;
  }

  /**
   * Build prompt for achievement generation (public wrapper)
   * @param challenge - Challenge text
   * @param actions - Actions text
   * @param result - Result text
   * @param client - Client work flag
   * @param targetAudience - Target audience
   * @returns Formatted prompt
   */
  buildPrompt(
    challenge: string,
    actions: string,
    result: string,
    client: boolean,
    targetAudience: string
  ): string {
    return this._buildPrompt(challenge, actions, result, client, targetAudience);
  }

  /**
   * Build prompt for achievement generation
   * @param challenge - Challenge text
   * @param actions - Actions text
   * @param result - Result text
   * @param _client - Client work flag (unused but kept for API compatibility)
   * @param targetAudience - Target audience
   * @returns Formatted prompt
   * @private
   */
  private _buildPrompt(
    challenge: string,
    actions: string,
    result: string,
    _client: boolean,
    targetAudience: string
  ): string {
    const carBlock = this._formatCAR(challenge, actions, result);
    const basePrompt = `${CONFIG.PROMPTS.ACHIEVEMENT_SIMPLIFIED}

${CONFIG.PROMPTS.SPECIFICS}
${CONFIG.PROMPTS.MARKS}
${carBlock}`;

    return TextUtils.replaceSizePlaceholders(basePrompt, targetAudience);
  }

  /**
   * Format Challenge-Actions-Result block
   * @param challenge - Challenge text
   * @param actions - Actions text
   * @param result - Result text
   * @returns Formatted CAR block
   * @private
   */
  private _formatCAR(challenge: string, actions: string, result: string): string {
    return `
CHALLENGE:

${challenge}

ACTIONS:

${actions}

RESULT:

${result}`;
  }

  /**
   * Normalize achievement to standard format
   * @param achievement - Achievement to normalize
   * @returns Normalized achievement
   */
  normalizeAchievement(achievement: string): string {
    const prompt = `${CONFIG.PROMPTS.NORMALIZE}

Achievement:
${achievement}`;

    return this.aiService.query(prompt, {
      maxTokens: CONFIG.AI.MAX_TOKENS.CATEGORIZATION,
      provider: 'claude',
    });
  }

  /**
   * Shorten achievement text
   * @param text - Text to shorten
   * @returns Shortened text
   */
  shortenAchievement(text: string): string {
    const scaleFactor = CONFIG.AI.SCALE_FACTOR * 2;
    const minLength = Math.round(CONFIG.AI.TEAL_BULLET_POINT_MIN_LENGTH / scaleFactor);
    const maxLength = Math.round(CONFIG.AI.TEAL_BULLET_POINT_MAX_LENGTH / scaleFactor);

    const prompt = `Shorten the following to between ${minLength} and ${maxLength} characters in length and return only the summary, ending with a period:

${text}`;

    return this.aiService.query(prompt, {
      maxTokens: CONFIG.AI.MAX_TOKENS.ACHIEVEMENT,
      provider: 'claude',
    });
  }

  /**
   * Categorize achievement by function
   * @param achievement - Achievement to categorize
   * @param functions - List of functions
   * @returns Category
   */
  categorizeAchievement(achievement: string, functions: string[]): string {
    const prompt = `Given the following resume bullet-point achievement, which of the following functions provided best describes what the achievement is about?

Return only one. If a word in the achievement matches a function, return that function.

ACHIEVEMENT: ${achievement}

FUNCTIONS: ${functions.join(', ')}`;

    return this.aiService.query(prompt, {
      maxTokens: CONFIG.AI.MAX_TOKENS.ARCHETYPE,
      provider: 'claude',
    });
  }

  /**
   * Generate unique ID for achievement
   * @param text - Text to hash
   * @returns Unique ID
   */
  generateUniqueId(text: string): string {
    return TextUtils.generateHash(text, 6);
  }
}

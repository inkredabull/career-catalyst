/**
 * Achievement Service - Generates achievements from CAR (Challenge-Action-Result)
 *
 * @module business/AchievementService
 */
import { AIService } from '../ai/AIService';
/**
 * Service for generating achievements from CAR (Challenge-Action-Result)
 */
export declare class AchievementService {
    private aiService;
    /**
     * Create an AchievementService
     * @param aiService - AI service instance
     */
    constructor(aiService: AIService);
    /**
     * Generate achievement from Challenge, Actions, and Result
     * @param challenge - The challenge faced
     * @param actions - Actions taken
     * @param result - Result achieved
     * @param client - Whether this was client work
     * @param targetAudience - Target audience ('cv' or 'linkedin')
     * @returns Generated achievement
     */
    generateAchievement(challenge: string, actions: string, result: string, client?: boolean, targetAudience?: string): string;
    /**
     * Build prompt for achievement generation (public wrapper)
     * @param challenge - Challenge text
     * @param actions - Actions text
     * @param result - Result text
     * @param client - Client work flag
     * @param targetAudience - Target audience
     * @returns Formatted prompt
     */
    buildPrompt(challenge: string, actions: string, result: string, client: boolean, targetAudience: string): string;
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
    private _buildPrompt;
    /**
     * Format Challenge-Actions-Result block
     * @param challenge - Challenge text
     * @param actions - Actions text
     * @param result - Result text
     * @returns Formatted CAR block
     * @private
     */
    private _formatCAR;
    /**
     * Normalize achievement to standard format
     * @param achievement - Achievement to normalize
     * @returns Normalized achievement
     */
    normalizeAchievement(achievement: string): string;
    /**
     * Shorten achievement text
     * @param text - Text to shorten
     * @returns Shortened text
     */
    shortenAchievement(text: string): string;
    /**
     * Categorize achievement by function
     * @param achievement - Achievement to categorize
     * @param functions - List of functions
     * @returns Category
     */
    categorizeAchievement(achievement: string, functions: string[]): string;
    extractSituationAndTasks(challenge: string): string;
    /**
     * Generate unique ID for achievement
     * @param text - Text to hash
     * @returns Unique ID
     */
    generateUniqueId(text: string): string;
}
//# sourceMappingURL=AchievementService.d.ts.map
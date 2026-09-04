/**
 * Entry Points - Global functions exposed to Google Apps Script
 *
 * @module entry-points
 */
/**
 * Triggered when spreadsheet is opened
 * @param _e - Event object (unused)
 */
export declare function onOpen(_e?: GoogleAppsScript.Events.SheetsOnOpen): void;
/**
 * Generate achievement from current row
 * Menu item: "Generate summary"
 * Generates CV version first, then LinkedIn version, writing to each column automatically.
 */
export declare function fetch(): void;
/**
 * Shorten achievement in current cell
 * Menu item: "Shorten"
 */
export declare function shorten(): void;
/**
 * Evaluate achievement in current row
 * Menu item: "Evaluate achievement"
 * Note: Renamed from 'eval' to 'evaluate' (eval is reserved word)
 */
export declare function evaluate(): void;
/**
 * Find theme/category for achievement
 * Menu item: "Categorize"
 */
export declare function findTheme(): void;
/**
 * Get judgement score for achievement
 * Menu item: "Get judgement"
 */
export declare function getJudgement(): void;
/**
 * Get KPI for achievement
 * Menu item: "Get KPI"
 */
export declare function getKeyPerformanceIndicator(): void;
/**
 * Export work history as Google Doc
 * Menu item: "Get Work History as G Doc"
 */
export declare function getWorkHistoryAsGDoc(): void;
/**
 * Show modal for resume generation
 * Menu item: "Generate resume"
 */
export declare function showModal(): void;
/**
 * Sort the active sheet
 * Menu item: "Sort"
 */
export declare function sortSheet(): void;
/**
 * Create unique ID for achievement
 * Menu item: "Create ID"
 */
export declare function createID(): void;
/**
 * Create customization for job
 * Menu item: "Customize"
 */
export declare function createCustomization(): void;
/**
 * Generate achievement using specific model
 * @param modelName - Name of model ('claude', 'gemini', 'openai', 'mistral', 'cohere')
 */
export declare function fetchWithModel(modelName: string): void;
/**
 * Result object from model generation
 */
interface ModelGenerationResult {
    text: string;
    latencyMs: number;
    prompt: string;
    config: {
        provider: string;
        model: string;
        maxTokens: number;
        targetAudience: string;
        columnHeader: string;
    };
}
/**
 * Generate achievement without writing to cell (for comparison)
 * @param modelName - Name of model ('claude', 'gemini', 'openai', 'mistral', 'cohere')
 * @returns Result object with text, latency, prompt, and config
 */
export declare function generateAchievementWithModel(modelName: string): ModelGenerationResult;
/**
 * Set active cell value to selected model output
 * @param content - Achievement text to set
 */
export declare function setActiveCellValue(content: string): void;
/**
 * Log model choice and all outputs to "AI Feedback" sheet for RLHF
 * Called fire-and-forget from sidebar after user clicks "Choose This"
 * @param chosenModelId - Key of chosen model (e.g. 'claude')
 * @param rationale - Optional notes from user
 * @param allOutputs - Map of model key → generated text for all models
 */
export declare function logModelChoice(chosenModelId: string, rationale: string, allOutputs: Record<string, string>): void;
/**
 * Choose model for single generation
 * Menu item: "Choose Model"
 */
export declare function chooseModel(): void;
/**
 * Compare models side-by-side
 * Menu item: "Compare Models"
 */
export declare function compareModels(): void;
/**
 * View currently active AI models
 * Menu item: "View Current Models"
 */
export declare function viewCurrentModels(): void;
/**
 * Force refresh AI models from OpenRouter
 * Menu item: "Refresh Models"
 */
export declare function refreshModelsMenu(): void;
/**
 * One-time setup function for OpenRouter API key
 * Run this manually to configure API credentials
 */
export declare function setupAPIKeys(): void;
/**
 * Handle resume generation
 * Called from HTML dialog
 */
export declare function handleGenerate(): void;
/**
 * Include HTML file content (for templating)
 * @param filename - HTML file name
 * @returns HTML content
 */
export declare function include(filename: string): string;
/**
 * Rebuild the Table of Contents in the first sheet.
 * Creates clickable HYPERLINK formulas for every subsequent sheet.
 * Menu item: "Update Table of Contents"
 */
export declare function generateTableOfContents(): void;
/**
 * Extract Situation and Task from challenge text using AI
 * Menu item: "Extract Situation & Task"
 */
export declare function extractSituationAndTasks(): void;
export {};
//# sourceMappingURL=index.d.ts.map
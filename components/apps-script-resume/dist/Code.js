/******/ "use strict";
/******/ // The require scope
/******/ var __webpack_require__ = {};
/******/ 
/************************************************************************/
/******/ /* webpack/runtime/global */
/******/ (() => {
/******/ 	__webpack_require__.g = (function() {
/******/ 		if (typeof globalThis === 'object') return globalThis;
/******/ 		try {
/******/ 			return this || new Function('return this')();
/******/ 		} catch (e) {
/******/ 			if (typeof window === 'object') return window;
/******/ 		}
/******/ 	})();
/******/ })();
/******/ 
/************************************************************************/

// UNUSED EXPORTS: AIProviderBase, AIService, AchievementService, CONFIG, ConfigService, CustomizationService, DialogService, DocumentService, EvaluationService, Logger, MenuService, ModelDiscoveryService, OpenRouterProvider, ResumeFormatter, SheetService, TextUtils, ValidationUtils, WorkHistoryExporter, chooseModel, compareModels, createCustomization, createID, evaluate, fetch, fetchWithModel, findTheme, generateAchievementWithModel, generateTableOfContents, getJudgement, getKeyPerformanceIndicator, getWorkHistoryAsGDoc, handleGenerate, include, logModelChoice, onOpen, refreshModelsMenu, setActiveCellValue, setupAPIKeys, shorten, showModal, sortSheet, viewCurrentModels

;// ./src/config/index.ts
/**
 * Global configuration object containing all constants and settings
 *
 * @module config
 */
/**
 * Global configuration object
 */
const CONFIG = {
    // Sheet names
    SHEETS: {
        STORY_BANK: 'Work History : Story Bank',
        COMPANIES: 'Work History : Companies & Sequence',
        CUSTOMIZER: 'Resume : Customizer',
        CONFIG: 'Config',
        CV_VIEW: 'CV (View)',
        CV_TXT: 'CV.txt (all)',
        WORK_HISTORY: 'Work History',
        FUNCTION: 'Work History : Function',
        POSITIONING: 'Positioning : Mnookin PT',
        CUSTOMIZATION: 'Customization',
    },
    // Column mappings for Story Bank sheet
    COLUMNS: {
        STORY_BANK: {
            COMPANY: 'Company',
            SEQUENCE: 'Seq',
            CHALLENGE: 'Challenge',
            ACTIONS: 'Action',
            RESULT: 'Result',
            CLIENT: 'Client',
            ACHIEVEMENT: 'Achievement',
            SHORT: 'Short',
            LONG: 'Long',
            RESUME_BULLET_POINT: 'Resume Bullet Point',
            WOW: 'Wow',
            DOMAIN: 'Domain',
            INCLUDE: 'Include?',
            FOCUS: 'Focus',
            ID: 'ID',
            TEAL_ID: 'TealHQ ID',
            TIMING: 'Timing',
            CV: 'CV',
            LINKEDIN: 'LinkedIn',
        },
        COMPANIES: {
            COMPANY: 'Company',
            SEQUENCE: 'Sequence',
            TITLE: 'Title',
            DURATION: 'Duration',
            SUMMARY: 'Summary',
            STACK: 'Stack',
            DOMAIN: 'Domain',
        },
        CUSTOMIZER: {
            JOB_DESCRIPTION: 0, // Column A (0-indexed)
            RESUME: 1, // Column B (0-indexed)
        },
    },
    // AI Provider settings - Using OpenRouter for unified access
    AI: {
        ENDPOINT: 'https://openrouter.ai/api/v1/chat/completions',
        MODELS_ENDPOINT: 'https://openrouter.ai/api/v1/models',
        // Fallback models if dynamic discovery fails
        FALLBACK_MODELS: {
            CLAUDE: 'anthropic/claude-3.7-sonnet',
            GEMINI: 'google/gemini-1.5-flash',
            OPENAI: 'openai/gpt-4o-mini',
            MISTRAL: 'mistralai/mistral-large-2407',
            COHERE: 'cohere/command-r-plus',
        },
        // Model discovery settings
        DISCOVERY: {
            CACHE_DURATION_HOURS: 24, // Refresh model list daily
            PREFER_LATEST: true, // Use most recent models
            MIN_CONTEXT: 32000, // Minimum context window (tokens)
        },
        MAX_TOKENS: {
            ACHIEVEMENT_CV: 80, // CV format: longer, more comprehensive
            ACHIEVEMENT_LINKEDIN: 50, // LinkedIn format: shorter, more concise
            ACHIEVEMENT: 80, // Default (fallback to CV)
            ACHIEVEMENT_REASONING: 4096, // Flat cap for reasoning models (GPT-5.5, o-series, DeepSeek)
            RESUME: 2048,
            CATEGORIZATION: 15,
            ARCHETYPE: 20,
        },
        TEAL_BULLET_POINT_MIN_LENGTH: 140,
        TEAL_BULLET_POINT_MAX_LENGTH: 190,
        SHORT_SCALE: 2.2,
        LONG_SCALE: 1.33,
        SCALE_FACTOR: 1.33, // Use LONG_SCALE as default
        REASONING_MULTIPLIER: 10, // For reasoning models (DeepSeek, GPT-5.5, o-series) that need tokens for thinking
    },
    // Document generation settings
    DOCUMENT: {
        DEFAULT_PADDING: 4,
        DEFAULT_FONT_SIZE: 11,
        RESUME_TEMPLATE_ID: '1E7ttSQEnpsO5LMX1anSQ_dg2RJsqOQ_4WlO1Oadc-GY',
        INCLUDE_TECH_STACK: false,
    },
    // Resume filtering thresholds
    THRESHOLDS: {
        WOW_MIN: 6,
        WOW_THRESHOLD: 6,
        SEQUENCE_THRESHOLD: 4,
        COMPLETE_WOW: 3,
        COMPLETE_SEQUENCE: 10,
    },
    // Strengths to display on resume
    STRENGTHS: [
        'Process & Structure - Instills order and clarity to scale engineering with aligned execution',
        'Communication - Trusted communicator who fosters clarity, alignment, and cross-team collaboration',
        'Action-Oriented - Unblocks teams and delivers fast, practical solutions',
        'Leadership - Inspires vision, uplifts teams, and accelerates positive change',
        'Detail-Oriented - Brings structure, clarity, and accountability to complex ideas',
    ],
    // Key accomplishments to display on resume
    KEY_ACCOMPLISHMENTS: [
        'Drove 35% productivity gain via AI in 2024',
        'Launched 0-1 marketplace in 2023; 1st $1M',
        'Boosted ARR 50% via data platform in 2022',
        'Delivered 1200% productivity gain in 2022',
    ],
    // Prompt templates
    PROMPTS: {
        SYSTEM_ROLE: 'You are a professional, experienced copywriter specializing in writing resumes for executive product engineering roles.',
        BULLET_CHAR: 'Start with a Unicode bullet character e.g. U+2022',
        MARKS: `Omit any reference marks; do not use symbols like '*,' '**,' or '-.'
Omit use definite or indefinite articles such as 'the' or 'a'.
Do not end with a period.`,
        SPECIFICS: 'Do not provide any reasoning or contextualization; simply return the output without any prefix or suffix.',
        FORMATTING_TEMPLATE: `An achievement must be at least minOuputSizeInChars characters long and cannot be more than maxOuputSizeInChars characters long and must be a singular sentence.

For the achievement, start it with one and only one action verb. Avoid passive language that conveys 'Doing' versus 'Achieving.'

Here is an example of passive language or 'Doing': "Negotiated contracts with vendors"
Here is an example of action language or 'Achieving': "Slashed payroll/benefits administration costs 30% by negotiating pricing and fees, while ensuring the continuation and enhancements of services."

If proper noun references are made, include those.`,
        NORMALIZE: `Convert the Achievement below into a resume bullet point that meets ALL of the following criteria:

REQUIRED CRITERIA:

Length: 40-60 characters total (strict requirement)
Structure: [Action Verb] + [Object/Outcome] + "by" + [Number/Percentage/Timeframe]
Action Verb: Must start with a past-tense action verb (e.g., Built, Reduced, Increased, Delivered, Improved, Launched)
Quantification: Must include exactly ONE specific number, percentage, or timeframe
Single Focus: Describe only ONE achievement or metric (not multiple outcomes)
Conciseness: No complex clauses, no conjunctions (and, or), no sub-clauses

VALID Examples:

Improved search results by 400%.
Increased test coverage by 300%.
Improved email deliverability by 25%.
Built payment system in 6 weeks.
Reduced server costs by 40%.

INVALID Examples (and why they fail):

"Streamlined documentation process of company's core data model through use of dbdiagram.io"
❌ Exceeds 60 characters, no quantification, too complex
"Spearheaded cultural transformation, shifting organization from Waterfall to Agile+Scrum, resulting in 25% increase in team velocity and 30% reduction in project delivery timelines"
❌ Far exceeds 60 characters, multiple metrics, compound structure
"Boosted team performance via strategic exits, coaching, Agile training, clarified career paths"
❌ Exceeds 60 characters, multiple activities, no quantification

Output Requirements:

Return ONLY the reformatted bullet point
Do NOT end with puncutation
No quotation marks, explanations, or additional text
Must pass all 6 criteria above`,
        IS_IMPACTFUL: `Evaluate if the following achievement meets ALL criteria:

1. Character count between 40-60? (YES/NO)
2. Starts with action verb? (YES/NO)
3. Contains exactly ONE quantifiable metric? (YES/NO)
4. Follows structure [Verb + Object + by + Number]? (YES/NO)
5. Single focus (not compound)? (YES/NO)
6. No complex clauses or conjunctions? (YES/NO)

Return TRUE only if all 6 = YES. Otherwise return FALSE. Return only TRUE or FALSE.`,
        ACHIEVEMENT_SIMPLIFIED: `
Given the following CHALLENGE, ACTIONS, and RESULT, summarize into a single achievement which:

* follows the format: "[action verb] [what was done] using/via/with [how it was done] to [quantifiable result]"
* is approximately maxOuputSizeInChars characters
* MUST incorporate HOW the achievement was delivered — extract specific technologies, tools, platforms, methods, and approaches from ACTIONS and include them explicitly (e.g., "using Claude Code in Plan mode with background agents", "via RAG pipeline", "leveraging React dashboard")
* use technical verbiage verbatim from ACTIONS — do not omit named AI frameworks, coding tools, delivery patterns, or specific technologies
* if ACTIONS mentions cutting-edge or novel tools, ensure these appear in the summary`,
        ACHIEVEMENT_LINKEDIN_HOW: `Given the shorter length limit, include the single most distinctive technology or approach (e.g., "using AI agents" or "via RAG") — do not omit the HOW entirely just because space is limited.`,
        BEST_EFFORT: `If any of the Challenge, Actions, or Result contains the following, make a best effort to incorporate it/them in the summary:

* mention of 'Agile' or 'Scrum'
* a reference to working with and/or collaborating an individual or team
* a reference to anyone in the C-Suite (e.g. CEO, CTO) or leadership (e.g. VP or Director)
* any mention of identifying problem and then solving them
* any mention of something being '1st' or 'first'
* any quantitative values
* references to proper nouns and/or specific technologies
* a time-based reference (e.g. 'over X weeks' or 'in Y months')
* a reference to 'hands-on'
* a reference to a country

Lead the summary with any quantitative improvement outcome as followed by implementation or other details.`,
    },
    // Contact information
    CONTACT: {
        NAME: 'Anthony Bull',
        LOCATION: 'San Francisco, CA',
        PHONE: '+1 415-269-4893',
        EMAIL: 'anthony at bluxomelabs.com',
        LINKEDIN: 'linkedin.com/in/anthony-bull',
    },
    // Education
    EDUCATION: [
        {
            degree: 'MS Information Science @ UNC Chapel Hill',
            details: [
                'Focus on Information Retrieval, Bayesian Classification, & Recommendation Systems',
            ],
        },
        {
            degree: 'BA in Mathematics @ Hope College',
            details: [],
        },
    ],
    // Debug flag
    DEBUG: false,
};

;// ./src/utils/Logger.ts
/**
 * Logger utility class for consistent logging
 *
 * @module utils/Logger
 */
class Logger {
    /**
     * Log a message (supports multiple arguments)
     * @param args - Message parts to log
     */
    static log(...args) {
        console.log('[INFO]', ...args);
    }
    /**
     * Log an error with stack trace
     * @param message - Error message
     * @param error - Error object or additional context (optional)
     */
    static error(message, error) {
        if (error instanceof Error) {
            console.error(`[ERROR] ${message}`, error);
            if (error.stack) {
                console.error(error.stack);
            }
        }
        else {
            console.error(`[ERROR] ${message}`, error);
        }
    }
    /**
     * Log a warning
     * @param message - Warning message
     */
    static warn(message) {
        console.warn(`[WARN] ${message}`);
    }
}

;// ./src/utils/ValidationUtils.ts
/**
 * Validation utility class
 *
 * @module utils/ValidationUtils
 */
class ValidationUtils {
    /**
     * Validate that a sheet exists
     * @param sheetName - Name of the sheet
     * @returns True if sheet exists
     */
    static validateSheetExists(sheetName) {
        const ss = SpreadsheetApp.getActive();
        const sheet = ss.getSheetByName(sheetName);
        if (!sheet) {
            throw new Error(`Sheet "${sheetName}" does not exist`);
        }
        return true;
    }
    /**
     * Validate cell value type
     * @param value - Value to validate
     * @param type - Expected type
     * @returns True if valid
     */
    static validateCellValue(value, type) {
        switch (type) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number' && !isNaN(value);
            case 'boolean':
                return typeof value === 'boolean';
            default:
                return true;
        }
    }
    /**
     * Validate API key exists
     * @param keyName - Name of the API key
     * @returns True if key exists
     */
    static validateAPIKey(keyName) {
        const props = PropertiesService.getScriptProperties();
        const key = props.getProperty(keyName);
        if (!key) {
            throw new Error(`API key "${keyName}" not found. Run setupAPIKeys() first.`);
        }
        return true;
    }
}

;// ./src/utils/TextUtils.ts
/**
 * Text utility class
 *
 * @module utils/TextUtils
 */

class TextUtils {
    /**
     * Generate unique hash for text
     * @param text - Text to hash
     * @param length - Length of hash (default: 6)
     * @returns Hex hash
     */
    static generateHash(text, length = 6) {
        let hexstr = '';
        const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text);
        for (let i = 0; i < digest.length; i++) {
            const val = (digest[i] + 256) % 256;
            hexstr += ('0' + val.toString(16)).slice(-2);
        }
        return hexstr.slice(0, length);
    }
    /**
     * Truncate text to maximum length
     * @param text - Text to truncate
     * @param maxLength - Maximum length
     * @returns Truncated text
     */
    static truncate(text, maxLength) {
        if (text.length <= maxLength)
            return text;
        return text.slice(0, maxLength - 3) + '...';
    }
    /**
     * Escape markdown characters
     * @param text - Text to escape
     * @returns Escaped text
     */
    static escapeMarkdown(text) {
        return text
            .replace(/\*/g, '\\*')
            .replace(/_/g, '\\_')
            .replace(/\[/g, '\\[')
            .replace(/\]/g, '\\]');
    }
    /**
     * Convert basic Markdown to HTML
     * @param markdown - Markdown text
     * @returns HTML text
     */
    static convertMarkdownToHtml(markdown) {
        const html = markdown
            // Replace Markdown headings (#, ##, ###, etc.)
            .replace(/^(#{1,6})\s+(.*)/gm, (_match, hashes, title) => {
            const level = hashes.length;
            return `<h${level}>${title}</h${level}>`;
        })
            // Bold **text**
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            // Italic *text*
            .replace(/\*(.*?)\*/g, '<i>$1</i>')
            // Convert newlines to <br>
            .replace(/\n/g, '<br>');
        return `<html><body>${html}</body></html>`;
    }
    /**
     * Replace size placeholders in text
     * @param text - Text with placeholders
     * @param targetAudience - Target audience ('cv' or 'linkedin')
     * @returns Text with replaced values
     */
    static replaceSizePlaceholders(text, targetAudience = 'linkedin') {
        const scaleFactor = targetAudience !== 'linkedin' ? CONFIG.AI.LONG_SCALE : CONFIG.AI.SHORT_SCALE;
        const minLength = Math.round(CONFIG.AI.TEAL_BULLET_POINT_MIN_LENGTH / scaleFactor);
        const maxLength = Math.round(CONFIG.AI.TEAL_BULLET_POINT_MAX_LENGTH / scaleFactor);
        return text
            .replace(/minOuputSizeInChars/g, String(minLength))
            .replace(/maxOuputSizeInChars/g, String(maxLength));
    }
    /**
     * Extract first word (verb) from text
     * @param input - Input text
     * @returns First word
     */
    static extractVerb(input) {
        if (typeof input !== 'string')
            return '';
        const words = input.split(' ');
        return words.length > 0 ? words[0] : '';
    }
}

;// ./src/data/SheetService.ts
/**
 * Sheet Service - Handles all spreadsheet data access operations
 *
 * @module data/SheetService
 */

/**
 * Service for interacting with Google Sheets
 */
class SheetService {
    /**
     * Create a new SheetService
     * @param spreadsheet - Optional spreadsheet object
     */
    constructor(spreadsheet = null) {
        this.spreadsheet = spreadsheet || SpreadsheetApp.getActive();
    }
    /**
     * Get a sheet by name
     * @param sheetName - Name of the sheet
     * @returns Sheet object
     * @throws Error if sheet doesn't exist
     */
    getSheet(sheetName) {
        const sheet = this.spreadsheet.getSheetByName(sheetName);
        if (!sheet) {
            throw new Error(`Sheet "${sheetName}" not found`);
        }
        return sheet;
    }
    /**
     * Ensure a sheet exists, create if not
     * @param sheetName - Name of the sheet
     * @returns Sheet object
     */
    ensureSheet(sheetName) {
        let sheet = this.spreadsheet.getSheetByName(sheetName);
        if (!sheet) {
            sheet = this.spreadsheet.insertSheet(sheetName);
        }
        return sheet;
    }
    /**
     * Get all data from a sheet
     * @param sheetName - Name of the sheet
     * @returns 2D array of values
     */
    getSheetData(sheetName) {
        const sheet = this.getSheet(sheetName);
        return sheet.getDataRange().getValues();
    }
    /**
     * Get headers from a sheet
     * @param sheetName - Name of the sheet
     * @returns Array of header names
     */
    getHeaders(sheetName) {
        const data = this.getSheetData(sheetName);
        return data.length > 0 ? data[0] : [];
    }
    /**
     * Get cell value
     * @param sheetName - Name of the sheet
     * @param row - Row number (1-indexed)
     * @param col - Column number (1-indexed)
     * @returns Cell value
     */
    getCellValue(sheetName, row, col) {
        const sheet = this.getSheet(sheetName);
        return sheet.getRange(row, col).getValue();
    }
    /**
     * Set cell value
     * @param sheetName - Name of the sheet
     * @param row - Row number (1-indexed)
     * @param col - Column number (1-indexed)
     * @param value - Value to set
     */
    setCellValue(sheetName, row, col, value) {
        const sheet = this.getSheet(sheetName);
        sheet.getRange(row, col).setValue(value);
    }
    /**
     * Sort a sheet by columns
     * @param sheetName - Name of the sheet
     * @param sortColumns - Array of {column: number, ascending: boolean}
     */
    sortSheet(sheetName, sortColumns) {
        const sheet = this.getSheet(sheetName);
        const dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn());
        dataRange.sort(sortColumns);
    }
    /**
     * Get Story Bank data with headers
     * @returns Object with headers array and rows array
     */
    getStoryBankData() {
        const data = this.getSheetData(CONFIG.SHEETS.STORY_BANK);
        const headers = data.shift();
        return { headers, rows: data };
    }
    /**
     * Get Company data as object
     * @returns Company data keyed by company name
     */
    getCompanyData() {
        const sheet = this.getSheet(CONFIG.SHEETS.COMPANIES);
        const data = sheet.getDataRange().getValues();
        const headers = data[0];
        const companyIndex = headers.indexOf(CONFIG.COLUMNS.COMPANIES.COMPANY);
        const sequenceIndex = headers.indexOf(CONFIG.COLUMNS.COMPANIES.SEQUENCE);
        const titleIndex = headers.indexOf(CONFIG.COLUMNS.COMPANIES.TITLE);
        const durationIndex = headers.indexOf(CONFIG.COLUMNS.COMPANIES.DURATION);
        const summaryIndex = headers.indexOf(CONFIG.COLUMNS.COMPANIES.SUMMARY);
        const stackIndex = headers.indexOf(CONFIG.COLUMNS.COMPANIES.STACK);
        const domainIndex = headers.indexOf(CONFIG.COLUMNS.COMPANIES.DOMAIN);
        const companyData = {};
        // Skip header row
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row)
                continue;
            const company = row[companyIndex];
            if (company) {
                companyData[company] = {
                    sequence: row[sequenceIndex] || '',
                    title: row[titleIndex] || '',
                    duration: row[durationIndex] || '',
                    summary: row[summaryIndex] || '',
                    stack: row[stackIndex] || '',
                    domain: row[domainIndex] || '',
                };
            }
        }
        return companyData;
    }
    /**
     * Get active cell
     * @returns Active cell range
     */
    getActiveCell() {
        return this.spreadsheet.getActiveSheet().getActiveCell();
    }
    /**
     * Get active row data
     * @param sheetName - Name of the sheet
     * @returns Object with rowIndex, row array, and headers array
     */
    getActiveRowData(sheetName) {
        const sheet = this.getSheet(sheetName);
        const data = sheet.getDataRange().getValues();
        const headers = data.shift();
        const currentCell = sheet.getActiveCell();
        const rowIndex = currentCell.getRow();
        const rowAsRange = sheet.getRange(`${rowIndex}:${rowIndex}`);
        const row = rowAsRange.getValues()[0] || [];
        return { rowIndex, row, headers };
    }
}

;// ./src/data/ConfigService.ts
/**
 * Config Service - Manages configuration and API keys
 *
 * @module data/ConfigService
 */


/**
 * Service for managing configuration
 */
class ConfigService {
    /**
     * Create a new ConfigService
     * @param sheetService - Sheet service instance
     */
    constructor(sheetService) {
        this.sheetService = sheetService;
        this.cache = {};
    }
    /**
     * Get configuration value
     * @param key - Configuration key
     * @param defaultValue - Default value if not found
     * @returns Configuration value
     */
    get(key, defaultValue = null) {
        if (this.cache[key] !== undefined) {
            return this.cache[key];
        }
        try {
            const sheet = this.sheetService.getSheet(CONFIG.SHEETS.CONFIG);
            const data = sheet.getDataRange().getValues();
            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                if (row && row[0] === key) {
                    this.cache[key] = row[1];
                    return this.cache[key];
                }
            }
        }
        catch (error) {
            Logger.warn(`Config key "${key}" not found, using default: ${String(defaultValue)}`);
        }
        return defaultValue;
    }
    /**
     * Set configuration value
     * @param key - Configuration key
     * @param value - Value to set
     */
    set(key, value) {
        const sheet = this.sheetService.getSheet(CONFIG.SHEETS.CONFIG);
        const data = sheet.getDataRange().getValues();
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            if (row && row[0] === key) {
                sheet.getRange(i + 1, 2).setValue(value);
                this.cache[key] = value;
                return;
            }
        }
        // If key doesn't exist, append it
        const newRow = sheet.getLastRow() + 1;
        sheet.getRange(newRow, 1).setValue(key);
        sheet.getRange(newRow, 2).setValue(value);
        this.cache[key] = value;
    }
    /**
     * Get API key from Script Properties
     * @param provider - Provider name (CLAUDE, GEMINI, OPENAI)
     * @returns API key
     * @throws Error if key not found
     */
    getAPIKey(provider) {
        const props = PropertiesService.getScriptProperties();
        const keyName = `${provider.toUpperCase()}_API_KEY`;
        const key = props.getProperty(keyName);
        if (!key) {
            throw new Error(`API key not found for ${provider}. Run setupAPIKeys() first.`);
        }
        return key;
    }
    /**
     * Set API key in Script Properties
     * @param provider - Provider name
     * @param key - API key
     */
    setAPIKey(provider, key) {
        const props = PropertiesService.getScriptProperties();
        const keyName = `${provider.toUpperCase()}_API_KEY`;
        props.setProperty(keyName, key);
    }
    /**
     * Get minimum wow threshold
     * @returns Minimum wow value
     */
    getMinWow() {
        return this.get('MIN_WOW', CONFIG.THRESHOLDS.WOW_MIN);
    }
    /**
     * Get respect include flag
     * @returns Whether to respect include flag
     */
    getRespectIncludeFlag() {
        return this.get('RESPECT_INCLUDE_FLAG', true);
    }
    /**
     * Get wow threshold
     * @returns Wow threshold
     */
    getWowThreshold() {
        return CONFIG.THRESHOLDS.WOW_THRESHOLD;
    }
    /**
     * Get sequence threshold
     * @returns Sequence threshold
     */
    getSequenceThreshold() {
        return CONFIG.THRESHOLDS.SEQUENCE_THRESHOLD;
    }
}

;// ./src/data/ModelDiscoveryService.ts
/**
 * Model Discovery Service - Discovers and caches latest AI models from OpenRouter
 *
 * @module data/ModelDiscoveryService
 */


/**
 * Service for discovering and caching latest AI models from OpenRouter
 */
class ModelDiscoveryService {
    /**
     * Create a ModelDiscoveryService
     * @param apiKey - OpenRouter API key
     */
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.cacheKey = 'OPENROUTER_MODELS_CACHE';
        this.timestampKey = 'OPENROUTER_MODELS_TIMESTAMP';
    }
    /**
     * Get cached models or fetch fresh ones
     * @returns Model map {claude: 'id', gemini: 'id', openai: 'id'}
     */
    getModels() {
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
        }
        catch (error) {
            Logger.error('Model discovery failed, using fallbacks', error);
            return CONFIG.AI.FALLBACK_MODELS;
        }
    }
    /**
     * Force refresh models from API
     * @returns Model map
     */
    refreshModels() {
        try {
            const models = this._fetchModels();
            this._cacheModels(models);
            Logger.log('Models refreshed successfully');
            return models;
        }
        catch (error) {
            Logger.error('Model refresh failed', error);
            return CONFIG.AI.FALLBACK_MODELS;
        }
    }
    /**
     * Get cached models if still valid
     * @returns Cached models or null
     * @private
     */
    _getCachedModels() {
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
        return JSON.parse(cachedJson);
    }
    /**
     * Cache models with timestamp
     * @param models - Models to cache
     * @private
     */
    _cacheModels(models) {
        const props = PropertiesService.getScriptProperties();
        props.setProperty(this.cacheKey, JSON.stringify(models));
        props.setProperty(this.timestampKey, Date.now().toString());
    }
    /**
     * Fetch models from OpenRouter API
     * @returns Model map
     * @private
     */
    _fetchModels() {
        const options = {
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
        const data = JSON.parse(response.getContentText());
        return this._selectBestModels(data.data);
    }
    /**
     * Select best model for each provider
     * @param models - Array of model objects from API
     * @returns Model map
     * @private
     */
    _selectBestModels(models) {
        var _a, _b, _c, _d, _e;
        const providers = {
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
            const isChat = modelId.includes('chat') ||
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
            // Skip reasoning models — they consume excessive tokens for short text generation tasks
            const isReasoningModel = /openai\/gpt-5/.test(modelId) || // entire gpt-5 family are reasoning models
                modelId.includes('deepseek-r') ||
                /\/o\d/.test(modelId); // o1, o3, o4, etc.
            if (isReasoningModel) {
                return;
            }
            // Select if we don't have one yet, or this is "better"
            if (!providers[provider]) {
                providers[provider] = model;
            }
            else {
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
        const result = {
            CLAUDE: ((_a = providers['anthropic']) === null || _a === void 0 ? void 0 : _a.id) || CONFIG.AI.FALLBACK_MODELS.CLAUDE,
            GEMINI: ((_b = providers['google']) === null || _b === void 0 ? void 0 : _b.id) || CONFIG.AI.FALLBACK_MODELS.GEMINI,
            OPENAI: ((_c = providers['openai']) === null || _c === void 0 ? void 0 : _c.id) || CONFIG.AI.FALLBACK_MODELS.OPENAI,
            MISTRAL: ((_d = providers['mistralai']) === null || _d === void 0 ? void 0 : _d.id) || CONFIG.AI.FALLBACK_MODELS.MISTRAL,
            COHERE: ((_e = providers['cohere']) === null || _e === void 0 ? void 0 : _e.id) || CONFIG.AI.FALLBACK_MODELS.COHERE,
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
    _compareModelGenerations(model1, model2) {
        // Look for version numbers
        const extractVersion = (id) => {
            const match = id.match(/(\d+\.?\d*)/);
            return match && match[1] ? parseFloat(match[1]) : 0;
        };
        const v1 = extractVersion(model1);
        const v2 = extractVersion(model2);
        // Prefer known flagship models
        const isFlagship = (id) => {
            return (id.includes('sonnet') ||
                id.includes('opus') ||
                id.includes('gpt-4') ||
                id.includes('gpt-5') ||
                id.includes('flash') ||
                id.includes('large') ||
                id.includes('v3'));
        };
        if (isFlagship(model1) && !isFlagship(model2))
            return true;
        if (!isFlagship(model1) && isFlagship(model2))
            return false;
        return v1 > v2;
    }
}

;// ./src/ai/AIProviderBase.ts
/**
 * AI Provider Base - Abstract base class for AI providers
 *
 * @module ai/AIProviderBase
 */

/**
 * Base class for AI providers
 */
class AIProviderBase {
    /**
     * Create an AI provider
     * @param apiKey - API key
     * @param model - Model name
     * @param name - Provider name
     */
    constructor(apiKey, model, name) {
        this.apiKey = apiKey;
        this.model = model;
        this.name = name;
    }
    /**
     * Query the AI provider
     * @param prompt - Prompt text
     * @param maxTokens - Maximum output tokens
     * @returns AI response
     */
    query(prompt, maxTokens = 1000) {
        try {
            const payload = this.generatePayload(prompt, maxTokens);
            const headers = this.generateAuthHeader();
            const options = {
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
                Logger.log(`AI response length: ${result.length}`);
                return result;
            }
            else {
                const errorText = response.getContentText();
                Logger.error(`AI query failed: ${errorText}`);
                throw new Error(errorText);
            }
        }
        catch (error) {
            Logger.error(`AI query failed: ${error.message}`, error);
            throw error;
        }
    }
}

;// ./src/ai/OpenRouterProvider.ts
/**
 * OpenRouter Provider - Unified AI provider via OpenRouter API
 *
 * @module ai/OpenRouterProvider
 */



/**
 * OpenRouter unified AI provider
 * Access to Claude, Gemini, OpenAI, Mistral, Cohere, and 200+ models through single API
 */
class OpenRouterProvider extends AIProviderBase {
    /**
     * Create an OpenRouter provider
     * @param apiKey - OpenRouter API key
     */
    constructor(apiKey) {
        super(apiKey, '', 'openrouter');
    }
    /**
     * Get OpenRouter API endpoint
     * @returns Endpoint URL
     */
    getEndpoint() {
        return CONFIG.AI.ENDPOINT;
    }
    /**
     * Generate OpenRouter request payload
     * @param prompt - Prompt text
     * @param maxTokens - Maximum output tokens
     * @param modelName - Model identifier (e.g., 'anthropic/claude-3.7-sonnet')
     * @returns Request payload
     */
    generatePayload(prompt, maxTokens, modelName) {
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
    generateAuthHeader() {
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
    parseResponse(response) {
        const json = JSON.parse(response.getContentText());
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
        const message = choice === null || choice === void 0 ? void 0 : choice.message;
        const finishReason = choice === null || choice === void 0 ? void 0 : choice.finish_reason;
        // Normalise content — newer models may return an array of content blocks
        const rawContent = message === null || message === void 0 ? void 0 : message.content;
        let content = '';
        if (Array.isArray(rawContent)) {
            content = rawContent
                .filter((b) => b.type === 'text' && b.text)
                .map((b) => b.text)
                .join('');
        }
        else {
            content = rawContent || '';
        }
        const reasoning = (message === null || message === void 0 ? void 0 : message.reasoning) || '';
        if (reasoning) {
            Logger.log(`Model reasoning detected (${reasoning.length} chars)`);
        }
        if (!content || content.trim().length === 0) {
            if (finishReason === 'length' && reasoning) {
                Logger.error('Reasoning model hit token limit before producing final answer');
                Logger.error(`Reasoning length: ${reasoning.length} chars`);
                throw new Error('Model used all tokens for reasoning and did not produce final answer. Increase REASONING_MULTIPLIER.');
            }
            else if (reasoning) {
                Logger.error('Model produced reasoning but no final content');
                throw new Error('Model produced reasoning but no final answer in content field');
            }
            else {
                Logger.error('Empty content, finish_reason=' + finishReason, JSON.stringify(message));
                throw new Error(`Invalid response: no content (finish_reason=${finishReason !== null && finishReason !== void 0 ? finishReason : 'unknown'})`);
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
    queryWithModel(prompt, maxTokens, modelName) {
        try {
            const payload = this.generatePayload(prompt, maxTokens, modelName);
            const headers = this.generateAuthHeader();
            const options = {
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
            }
            else {
                const errorText = response.getContentText();
                Logger.error(`OpenRouter query failed: ${errorText}`);
                throw new Error(errorText);
            }
        }
        catch (error) {
            Logger.error(`OpenRouter query failed: ${error.message}`, error);
            throw error;
        }
    }
}

;// ./src/ai/AIService.ts
/**
 * AI Service - Main service for AI operations using OpenRouter
 *
 * @module ai/AIService
 */




/**
 * AI Service using OpenRouter for unified model access
 */
class AIService {
    /**
     * Create an AI service
     * @param configService - Configuration service
     */
    constructor(configService) {
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
     * @returns Model map {claude: 'id', gemini: 'id', openai: 'id', mistral: 'id', cohere: 'id'}
     */
    discoverModels() {
        try {
            const discovered = this.discovery.getModels();
            return {
                claude: discovered.CLAUDE,
                gemini: discovered.GEMINI,
                openai: discovered.OPENAI,
                mistral: discovered.MISTRAL,
                cohere: discovered.COHERE,
            };
        }
        catch (error) {
            Logger.warn(`Model discovery failed, using fallbacks: ${error.message}`);
            return {
                claude: CONFIG.AI.FALLBACK_MODELS.CLAUDE,
                gemini: CONFIG.AI.FALLBACK_MODELS.GEMINI,
                openai: CONFIG.AI.FALLBACK_MODELS.OPENAI,
                mistral: CONFIG.AI.FALLBACK_MODELS.MISTRAL,
                cohere: CONFIG.AI.FALLBACK_MODELS.COHERE,
            };
        }
    }
    /**
     * Refresh models from OpenRouter (force cache refresh)
     * @returns Updated model map
     */
    refreshModels() {
        try {
            const discovered = this.discovery.refreshModels();
            this.modelMap = {
                claude: discovered.CLAUDE,
                gemini: discovered.GEMINI,
                openai: discovered.OPENAI,
                mistral: discovered.MISTRAL,
                cohere: discovered.COHERE,
            };
            Logger.log('Models refreshed:', JSON.stringify(this.modelMap));
            return this.modelMap;
        }
        catch (error) {
            Logger.error(`Model refresh failed: ${error.message}`);
            return this.modelMap; // Keep existing models
        }
    }
    /**
     * Query an AI model via OpenRouter
     * @param prompt - Prompt text
     * @param options - Query options {provider: string, maxTokens: number}
     * @returns AI response
     */
    query(prompt, options = {}) {
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
    setDefaultProvider(provider) {
        if (!this.modelMap[provider]) {
            throw new Error(`Model "${provider}" not available`);
        }
        this.defaultModel = provider;
    }
}

;// ./src/document/DocumentService.ts
/**
 * Document Service - Handles Google Docs operations
 *
 * @module document/DocumentService
 */

/**
 * Service for document operations
 */
class DocumentService {
    constructor() {
        this.defaultPadding = CONFIG.DOCUMENT.DEFAULT_PADDING;
        this.defaultFontSize = CONFIG.DOCUMENT.DEFAULT_FONT_SIZE;
    }
    /**
     * Create a new Google Doc
     * @param title - Document title
     * @returns Document object
     */
    createDocument(title) {
        return DocumentApp.create(title);
    }
    /**
     * Open existing document by ID
     * @param docId - Document ID
     * @returns Document object
     */
    openDocument(docId) {
        return DocumentApp.openById(docId);
    }
    /**
     * Copy template document
     * @param templateId - Template document ID
     * @param newName - New document name
     * @returns Copied document
     */
    copyTemplate(templateId, newName) {
        const template = DriveApp.getFileById(templateId);
        const newDocId = template.makeCopy(newName).getId();
        return DocumentApp.openById(newDocId);
    }
    /**
     * Append heading to body
     * @param body - Document body
     * @param text - Heading text
     * @param level - Heading level (1-4)
     * @param alignment - Text alignment
     */
    appendHeading(body, text, level = 1, alignment = 'CENTER') {
        const headings = [
            DocumentApp.ParagraphHeading.HEADING1,
            DocumentApp.ParagraphHeading.HEADING2,
            DocumentApp.ParagraphHeading.HEADING3,
            DocumentApp.ParagraphHeading.HEADING4,
        ];
        const headingType = headings[Math.min(level - 1, 3)] || DocumentApp.ParagraphHeading.HEADING1;
        const alignmentType = DocumentApp.HorizontalAlignment[alignment];
        const para = body.appendParagraph(text);
        para.setHeading(headingType);
        para.setAlignment(alignmentType);
        return para;
    }
    /**
     * Append paragraph to body
     * @param body - Document body
     * @param text - Paragraph text
     * @param options - Style options
     * @returns Paragraph element
     */
    appendParagraph(body, text, options = {}) {
        const para = body.appendParagraph(text);
        const { fontSize = this.defaultFontSize, bold = false, italic = false, alignment = 'LEFT', spacingBefore = this.defaultPadding, spacingAfter = this.defaultPadding, } = options;
        const textElement = para.editAsText();
        textElement.setFontSize(fontSize);
        if (bold)
            textElement.setBold(bold);
        if (italic)
            textElement.setItalic(italic);
        para.setAlignment(DocumentApp.HorizontalAlignment[alignment]);
        para.setAttributes({
            [DocumentApp.Attribute.SPACING_BEFORE]: spacingBefore,
            [DocumentApp.Attribute.SPACING_AFTER]: spacingAfter,
        });
        return para;
    }
    /**
     * Append list item to body
     * @param body - Document body
     * @param text - List item text
     * @param glyphType - Glyph type (BULLET, NUMBER, etc.)
     * @returns List item element
     */
    appendListItem(body, text, glyphType = 'BULLET') {
        const item = body.appendListItem(text);
        item.editAsText().setFontSize(this.defaultFontSize);
        item.setGlyphType(DocumentApp.GlyphType[glyphType]);
        return item;
    }
    /**
     * Append table to body
     * @param body - Document body
     * @param data - Table data
     * @param options - Table options
     * @returns Table element
     */
    appendTable(body, data, options = {}) {
        const table = body.appendTable(data);
        const { borderWidth = 0 } = options;
        table.setBorderWidth(borderWidth);
        return table;
    }
    /**
     * Append horizontal rule
     * @param body - Document body
     * @returns Rule element
     */
    appendHorizontalRule(body) {
        return body.appendHorizontalRule();
    }
}

;// ./src/business/AchievementService.ts
/**
 * Achievement Service - Generates achievements from CAR (Challenge-Action-Result)
 *
 * @module business/AchievementService
 */



/**
 * Service for generating achievements from CAR (Challenge-Action-Result)
 */
class AchievementService {
    /**
     * Create an AchievementService
     * @param aiService - AI service instance
     */
    constructor(aiService) {
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
    generateAchievement(challenge, actions, result, client = false, targetAudience = 'cv') {
        const prompt = this._buildPrompt(challenge, actions, result, client, targetAudience);
        // Select appropriate max_tokens based on target audience
        const maxTokens = targetAudience === 'linkedin'
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
    buildPrompt(challenge, actions, result, client, targetAudience) {
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
    _buildPrompt(challenge, actions, result, _client, targetAudience) {
        const carBlock = this._formatCAR(challenge, actions, result);
        const howAddendum = targetAudience === 'linkedin' ? `\n${CONFIG.PROMPTS.ACHIEVEMENT_LINKEDIN_HOW}` : '';
        const basePrompt = `${CONFIG.PROMPTS.ACHIEVEMENT_SIMPLIFIED}${howAddendum}

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
    _formatCAR(challenge, actions, result) {
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
    normalizeAchievement(achievement) {
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
    shortenAchievement(text) {
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
    categorizeAchievement(achievement, functions) {
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
    generateUniqueId(text) {
        return TextUtils.generateHash(text, 6);
    }
}

;// ./src/business/EvaluationService.ts
/**
 * Evaluation Service - Evaluates achievement quality and relevance
 *
 * @module business/EvaluationService
 */

/**
 * Service for evaluating achievements
 */
class EvaluationService {
    /**
     * Create an EvaluationService
     * @param aiService - AI service instance
     */
    constructor(aiService) {
        this.aiService = aiService;
    }
    /**
     * Evaluate if achievement meets quality criteria
     * @param achievement - Achievement to evaluate
     * @returns Evaluation result (TRUE/FALSE)
     */
    evaluateAchievement(achievement) {
        const prompt = `${CONFIG.PROMPTS.IS_IMPACTFUL}

Achievement: ${achievement}`;
        return this.aiService.query(prompt, {
            maxTokens: CONFIG.AI.MAX_TOKENS.CATEGORIZATION,
            provider: 'claude',
        });
    }
    /**
     * Check if achievement is impactful
     * @param achievement - Achievement to check
     * @returns True if impactful
     */
    isImpactful(achievement) {
        const result = this.evaluateAchievement(achievement);
        return result.toUpperCase().includes('TRUE');
    }
    /**
     * Get judgement score for achievement
     * @param achievement - Achievement to judge
     * @returns Judgement score
     */
    getJudgement(achievement) {
        const prompt = `On a scale of 1 to 10, where 1 means 'Boring.' and 10 means 'Amazing!' - how impressed are you by the following achievement?

Only return the numeric digit value.

Achievement: ${achievement}`;
        return this.aiService.query(prompt, {
            maxTokens: CONFIG.AI.MAX_TOKENS.CATEGORIZATION,
            provider: 'openai',
        });
    }
    /**
     * Check if achievement is relevant to job description
     * @param achievement - Achievement to check
     * @param jobDescription - Job description
     * @returns Relevance score
     */
    isRelevant(achievement, jobDescription) {
        const prompt = `Given the following job description:

${jobDescription}

Score the achievement:

'${achievement}'

... against the responsibilities defined in the job according to a 5-point Likert Scale of 'Not at all applicable' to 'Extremely applicable.'

Return only the score. If not applicable, return 'Not at all applicable')

${CONFIG.PROMPTS.MARKS}`;
        return this.aiService.query(prompt, {
            maxTokens: CONFIG.AI.MAX_TOKENS.CATEGORIZATION,
            provider: 'openai',
        });
    }
    /**
     * Check if sequence meets threshold criteria
     * @param sequence - Sequence number
     * @returns True if meets criteria
     */
    meetsSequenceCriteria(sequence) {
        return (sequence !== null &&
            sequence !== undefined &&
            Number(sequence) <= CONFIG.THRESHOLDS.SEQUENCE_THRESHOLD);
    }
    /**
     * Determine if achievement should be included
     * @param wowFactor - Wow factor score
     * @param sequence - Sequence number
     * @param meetsAdditionalCriteria - Additional criteria flag
     * @returns True if should include
     */
    shouldInclude(wowFactor, sequence, meetsAdditionalCriteria = true) {
        return (this.meetsSequenceCriteria(sequence) &&
            (wowFactor === 10 ||
                (wowFactor >= CONFIG.THRESHOLDS.WOW_THRESHOLD && meetsAdditionalCriteria)));
    }
}

;// ./src/business/CustomizationService.ts
/**
 * Customization Service - Customizes resumes for job descriptions
 *
 * @module business/CustomizationService
 */

/**
 * Service for customizing resumes
 */
class CustomizationService {
    /**
     * Create a CustomizationService
     * @param aiService - AI service instance (null if only using static methods)
     * @param sheetService - Sheet service instance
     */
    constructor(aiService, sheetService) {
        this.aiService = aiService;
        this.sheetService = sheetService;
    }
    /**
     * Customize resume for job description
     * @returns Customized resume in Markdown
     */
    customizeResume() {
        if (!this.aiService) {
            throw new Error('AIService is required for customizeResume()');
        }
        const resume = this._getResume();
        const jobDescription = this._getJobDescription();
        const basis = this._getCustomizationBasis();
        const prompt = `${basis}

JOB DESCRIPTION: ${jobDescription}

RESUME: ${resume}`;
        return this.aiService.query(prompt, {
            maxTokens: CONFIG.AI.MAX_TOKENS.RESUME,
            provider: 'claude',
        });
    }
    /**
     * Get resume text from sheet
     * @returns Resume text
     * @private
     */
    _getResume() {
        var _a;
        const data = this.sheetService.getSheetData(CONFIG.SHEETS.CUSTOMIZER);
        return ((_a = data[1]) === null || _a === void 0 ? void 0 : _a[CONFIG.COLUMNS.CUSTOMIZER.RESUME]) || '';
    }
    /**
     * Get job description from sheet
     * @returns Job description
     * @private
     */
    _getJobDescription() {
        var _a;
        const data = this.sheetService.getSheetData(CONFIG.SHEETS.CUSTOMIZER);
        return ((_a = data[1]) === null || _a === void 0 ? void 0 : _a[CONFIG.COLUMNS.CUSTOMIZER.JOB_DESCRIPTION]) || '';
    }
    /**
     * Build customization basis prompt
     * @returns Customization instructions
     * @private
     */
    _getCustomizationBasis() {
        const bullets = 'Each bullet point should be no more than 86 characters and begin with an asterisk.';
        const roles = 'Include only the most recent three roles.';
        const format = 'Return output as Markdown in the format of a reverse chronological resume.';
        return `Take the following RESUME and modify it to fit the needs of the following JOB DESCRIPTION.

Include 4-5 bullet points for the most recent job, 3-4 for the next job, and 2-3 for each job after that. ${bullets}

${roles} Always include dates for roles on the same line as title and company name.

Stipulate "Complete work history available upon request." in italics.

Include a "SKILLS" section with a bulleted overview of relevant skills.

For each role, include a summary overview of no more than two sentences.

Do not include a cover letter.

If an achievement in RESUME includes the name of the company for the JOB DESCRIPTION, be sure to include that explicit reference in the adapted version.

Include and begin with a professional summary.
${format}`;
    }
    /**
     * Get summary for resume
     * @returns Summary text
     */
    getSummaryForResume() {
        // Default summary - could be enhanced to be dynamic
        const asENGLeader = [
            "Hands-on technical leader who's scaled SaaS and data-driven products as well as global teams of up to 50 over 13+ years.",
            'Solid track record of ownership with a bias-to-action, especially around unblocking teams in support of execution.',
            'Proven ability to harness AI/ML to sharpen operations and accelerate time-to-market.',
            'Skilled at driving operational excellence, streamlining cross-functional communication, and consistently delivering high-impact products.',
            'Known for a servant-leadership that fosters mentorship, innovation, and cross-functional collaboration.',
        ];
        return asENGLeader.join(' ');
    }
}

;// ./src/business/ResumeFormatter.ts
/**
 * Resume Formatter - Formats resumes as Google Docs
 *
 * @module business/ResumeFormatter
 */


/**
 * Service for formatting resumes as Google Docs
 */
class ResumeFormatter {
    /**
     * Create a ResumeFormatter
     * @param documentService - Document service
     * @param sheetService - Sheet service
     */
    constructor(documentService, sheetService) {
        this.documentService = documentService;
        this.sheetService = sheetService;
    }
    /**
     * Generate a formatted resume document
     * @returns URL of generated document
     */
    generateResume() {
        const companyData = this.sheetService.getCompanyData();
        const { headers, rows } = this.sheetService.getStoryBankData();
        // Create document from template
        const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
        const documentName = `Resume for ${CONFIG.CONTACT.NAME} - ${timestamp}`;
        const doc = this.documentService.copyTemplate(CONFIG.DOCUMENT.RESUME_TEMPLATE_ID, documentName);
        const body = doc.getBody();
        // Build resume sections
        this._addHeader(body);
        this._addSummary(body);
        this._addKeyAccomplishments(body);
        this._addStrengths(body);
        this._addExperience(body, headers, rows, companyData);
        this._addEducation(body);
        doc.saveAndClose();
        return doc.getUrl();
    }
    /**
     * Add header section
     * @param body - Document body
     * @private
     */
    _addHeader(body) {
        const firstParagraph = body.getChild(0).asParagraph();
        firstParagraph.setText(CONFIG.CONTACT.NAME);
        firstParagraph.setHeading(DocumentApp.ParagraphHeading.HEADING1);
        firstParagraph.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        firstParagraph.setAttributes({
            [DocumentApp.Attribute.SPACING_BEFORE]: 0,
            [DocumentApp.Attribute.SPACING_AFTER]: 4,
        });
        const contactInfo = `${CONFIG.CONTACT.LOCATION} | ${CONFIG.CONTACT.PHONE} | ${CONFIG.CONTACT.EMAIL} | ${CONFIG.CONTACT.LINKEDIN}`;
        this.documentService.appendParagraph(body, contactInfo, {
            fontSize: 10,
            alignment: 'CENTER',
        });
        this.documentService.appendHorizontalRule(body);
    }
    /**
     * Add summary section
     * @param body - Document body
     * @private
     */
    _addSummary(body) {
        this.documentService.appendHeading(body, 'SUMMARY', 4);
        // Note: Passing null for aiService since we only need static summary
        const customizationService = new CustomizationService(null, this.sheetService);
        const summary = customizationService.getSummaryForResume();
        this.documentService.appendParagraph(body, summary, {
            alignment: 'LEFT',
            spacingBefore: CONFIG.DOCUMENT.DEFAULT_PADDING,
            spacingAfter: CONFIG.DOCUMENT.DEFAULT_PADDING,
        });
        this.documentService.appendHorizontalRule(body);
    }
    /**
     * Add key accomplishments section
     * @param body - Document body
     * @private
     */
    _addKeyAccomplishments(body) {
        this.documentService.appendHeading(body, 'KEY ACCOMPLISHMENTS', 4);
        this.documentService.appendTable(body, [
            [
                `${CONFIG.KEY_ACCOMPLISHMENTS[0]}\n${CONFIG.KEY_ACCOMPLISHMENTS[1]}`,
                `${CONFIG.KEY_ACCOMPLISHMENTS[2]}\n${CONFIG.KEY_ACCOMPLISHMENTS[3]}`,
            ],
        ], { borderWidth: 0 });
        this.documentService.appendHorizontalRule(body);
    }
    /**
     * Add strengths section
     * @param body - Document body
     * @private
     */
    _addStrengths(body) {
        this.documentService.appendHeading(body, 'STRENGTHS', 4);
        CONFIG.STRENGTHS.forEach((strength) => {
            if (strength) {
                const listItem = this.documentService.appendListItem(body, strength);
                const colonIndex = strength.indexOf(':');
                if (colonIndex > -1) {
                    listItem.editAsText().setBold(0, colonIndex - 1, true);
                }
            }
        });
        this.documentService.appendHorizontalRule(body);
    }
    /**
     * Add experience section
     * @param body - Document body
     * @param headers - Column headers
     * @param rows - Data rows
     * @param companyData - Company metadata
     * @private
     */
    _addExperience(body, headers, rows, companyData) {
        this.documentService.appendHeading(body, 'EXPERIENCE', 4);
        const companyIndex = headers.indexOf(CONFIG.COLUMNS.STORY_BANK.COMPANY);
        const includeIndex = headers.indexOf(CONFIG.COLUMNS.STORY_BANK.INCLUDE);
        const achievementIndex = headers.indexOf(CONFIG.COLUMNS.STORY_BANK.SHORT);
        // Filter and group achievements by company
        const companyMap = {};
        rows.forEach((row) => {
            const toBeIncluded = row[includeIndex];
            if (toBeIncluded) {
                const company = row[companyIndex];
                const achievement = row[achievementIndex];
                if (!companyMap[company]) {
                    companyMap[company] = [];
                }
                companyMap[company].push(achievement);
            }
        });
        // Add each company section
        for (const company in companyMap) {
            if (Object.prototype.hasOwnProperty.call(companyMap, company)) {
                const metadata = companyData[company];
                if (metadata) {
                    this._addCompanySection(body, company, companyMap[company] || [], metadata);
                }
            }
        }
        this.documentService.appendParagraph(body, 'Complete work history available upon request', {
            fontSize: CONFIG.DOCUMENT.DEFAULT_FONT_SIZE - 1,
            italic: true,
            alignment: 'CENTER',
            spacingBefore: CONFIG.DOCUMENT.DEFAULT_PADDING * 2,
            spacingAfter: CONFIG.DOCUMENT.DEFAULT_PADDING * 2,
        });
    }
    /**
     * Add company section
     * @param body - Document body
     * @param company - Company name
     * @param achievements - Achievements list
     * @param metadata - Company metadata
     * @private
     */
    _addCompanySection(body, company, achievements, metadata) {
        const role = metadata.title;
        const duration = metadata.duration;
        const combo = `${role} @ ${company}`;
        const table = this.documentService.appendTable(body, [[combo, duration]], { borderWidth: 0 });
        const row = table.getRow(0);
        const companyCell = row.getCell(0);
        companyCell.setPaddingBottom(0).setPaddingLeft(0).setPaddingRight(0);
        companyCell.setPaddingTop(CONFIG.DOCUMENT.DEFAULT_PADDING * 2);
        const companyPara = companyCell.getChild(0).asParagraph();
        companyPara.setAlignment(DocumentApp.HorizontalAlignment.LEFT);
        const companyText = companyPara.editAsText();
        companyText.setBold(true);
        companyText.setFontSize(12);
        const datesCell = row.getCell(1);
        datesCell.setPaddingBottom(0).setPaddingLeft(0).setPaddingRight(0);
        datesCell.setPaddingTop(CONFIG.DOCUMENT.DEFAULT_PADDING * 2);
        const datesPara = datesCell.getChild(0).asParagraph();
        datesPara.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
        const datesText = datesPara.editAsText();
        datesText.setBold(false);
        datesText.setFontSize(11);
        // Add domain and summary if available
        if (metadata.domain || metadata.summary) {
            const lastIndex = body.getNumChildren() - 1;
            const lastChild = body.getChild(lastIndex);
            if (lastChild.getType() === DocumentApp.ElementType.PARAGRAPH) {
                const paragraph = lastChild.asParagraph();
                if (paragraph.getText().trim() === '' && metadata.summary) {
                    paragraph.setText(metadata.domain || '');
                    paragraph.setAttributes({
                        [DocumentApp.Attribute.SPACING_BEFORE]: CONFIG.DOCUMENT.DEFAULT_PADDING,
                        [DocumentApp.Attribute.SPACING_AFTER]: CONFIG.DOCUMENT.DEFAULT_PADDING,
                    });
                    const paraText = paragraph.editAsText();
                    paraText.setItalic(true);
                    paraText.setFontSize(CONFIG.DOCUMENT.DEFAULT_FONT_SIZE);
                    this.documentService.appendParagraph(body, metadata.summary, {
                        italic: false,
                        spacingBefore: CONFIG.DOCUMENT.DEFAULT_PADDING,
                        spacingAfter: CONFIG.DOCUMENT.DEFAULT_PADDING,
                    });
                }
            }
        }
        // Add achievements
        achievements.forEach((achievement) => {
            if (achievement) {
                this.documentService.appendListItem(body, achievement);
            }
        });
        // Add tech stack if configured
        if (CONFIG.DOCUMENT.INCLUDE_TECH_STACK && metadata.stack) {
            this.documentService.appendParagraph(body, metadata.stack, {
                fontSize: CONFIG.DOCUMENT.DEFAULT_FONT_SIZE - 1,
                spacingBefore: CONFIG.DOCUMENT.DEFAULT_PADDING * 2,
                spacingAfter: CONFIG.DOCUMENT.DEFAULT_PADDING,
            });
        }
    }
    /**
     * Add education section
     * @param body - Document body
     * @private
     */
    _addEducation(body) {
        this.documentService.appendHeading(body, 'EDUCATION', 4);
        CONFIG.EDUCATION.forEach((edu) => {
            this.documentService.appendParagraph(body, edu.degree, {
                bold: true,
                fontSize: 12,
                alignment: 'LEFT',
                spacingBefore: CONFIG.DOCUMENT.DEFAULT_PADDING,
                spacingAfter: CONFIG.DOCUMENT.DEFAULT_PADDING,
            });
            edu.details.forEach((detail) => {
                this.documentService.appendListItem(body, detail);
            });
        });
    }
}

;// ./src/business/WorkHistoryExporter.ts
/**
 * Work History Exporter - Exports work history to Google Docs
 *
 * @module business/WorkHistoryExporter
 */


/**
 * Service for exporting work history to Google Docs
 */
class WorkHistoryExporter {
    /**
     * Create a WorkHistoryExporter
     * @param documentService - Document service
     * @param sheetService - Sheet service
     * @param evaluationService - Evaluation service
     */
    constructor(documentService, sheetService, evaluationService) {
        this.documentService = documentService;
        this.sheetService = sheetService;
        this.evaluationService = evaluationService;
    }
    /**
     * Export work history as Google Doc
     * @returns URL of created document
     */
    exportWorkHistory() {
        const title = `Work History as G Doc : ${Date.now()}`;
        const doc = this.documentService.createDocument(title);
        const body = doc.getBody();
        const { headers, rows } = this.sheetService.getStoryBankData();
        const groupedData = this._groupByCompany(headers, rows);
        let countOfWritten = 0;
        groupedData.forEach((companyData, index) => {
            if (index === 0) {
                const divider = body.appendParagraph(`@ ${companyData.company.toUpperCase()}`);
                divider.setHeading(DocumentApp.ParagraphHeading.HEADING1);
            }
            else {
                const divider = body.appendParagraph(`@ ${companyData.company.toUpperCase()}`);
                divider.setHeading(DocumentApp.ParagraphHeading.HEADING1);
            }
            companyData.items.forEach((item) => {
                countOfWritten++;
                this.documentService.appendHeading(body, item.short, 2);
                this.documentService.appendHeading(body, `Timeframe: ${item.timeFrame}`, 3);
                this.documentService.appendHeading(body, 'CHALLENGE', 3);
                this.documentService.appendParagraph(body, item.challenge);
                this.documentService.appendHeading(body, 'ACTIONS', 3);
                this.documentService.appendParagraph(body, item.actions);
                this.documentService.appendHeading(body, 'RESULT', 3);
                this.documentService.appendParagraph(body, item.result);
                this.documentService.appendHeading(body, `ID : ${item.uniqueID}`, 3);
                body.appendPageBreak();
            });
        });
        doc.saveAndClose();
        Logger.log(`Written ${countOfWritten} items`);
        Logger.log(doc.getUrl());
        return doc.getUrl();
    }
    /**
     * Group data by company
     * @param headers - Column headers
     * @param rows - Data rows
     * @returns Grouped data
     * @private
     */
    _groupByCompany(headers, rows) {
        const companyIndex = headers.indexOf(CONFIG.COLUMNS.STORY_BANK.COMPANY);
        const sequenceIndex = headers.indexOf(CONFIG.COLUMNS.STORY_BANK.SEQUENCE);
        const wowIndex = headers.indexOf(CONFIG.COLUMNS.STORY_BANK.WOW);
        const domainIndex = headers.indexOf(CONFIG.COLUMNS.STORY_BANK.DOMAIN);
        const challengeIndex = headers.indexOf(CONFIG.COLUMNS.STORY_BANK.CHALLENGE);
        const actionsIndex = headers.indexOf(CONFIG.COLUMNS.STORY_BANK.ACTIONS);
        const resultIndex = headers.indexOf(CONFIG.COLUMNS.STORY_BANK.RESULT);
        const shortIndex = headers.indexOf(CONFIG.COLUMNS.STORY_BANK.LONG);
        const idIndex = headers.indexOf(CONFIG.COLUMNS.STORY_BANK.ID);
        const timingIndex = headers.indexOf(CONFIG.COLUMNS.STORY_BANK.TIMING);
        const companyMap = new Map();
        rows.forEach((row) => {
            const sequence = row[sequenceIndex];
            const wow = row[wowIndex];
            const domain = row[domainIndex];
            const isProgramManagement = domain === 'Program Management';
            if (this.evaluationService.shouldInclude(wow, sequence, isProgramManagement)) {
                const company = String(row[companyIndex] || '');
                if (!companyMap.has(company)) {
                    companyMap.set(company, []);
                }
                companyMap.get(company).push({
                    challenge: String(row[challengeIndex] || ''),
                    actions: String(row[actionsIndex] || ''),
                    result: String(row[resultIndex] || ''),
                    short: String(row[shortIndex] || ''),
                    uniqueID: String(row[idIndex] || ''),
                    timeFrame: String(row[timingIndex] || ''),
                });
            }
        });
        // Convert to array format
        const result = [];
        let previousCompany = null;
        companyMap.forEach((items, company) => {
            result.push({
                company,
                items,
                isNewCompany: company !== previousCompany,
            });
            previousCompany = company;
        });
        return result;
    }
}

;// ./src/ui/MenuService.ts
/**
 * Menu Service - Manages spreadsheet menu items
 *
 * @module ui/MenuService
 */
/**
 * Service for managing menu items
 */
class MenuService {
    /**
     * Create custom menu in spreadsheet
     * @param ui - Spreadsheet UI object
     */
    static createCustomMenu(ui) {
        ui.createMenu('Utils')
            .addItem('Generate summary', 'fetch')
            .addItem('Choose Model', 'chooseModel')
            .addItem('Compare Models', 'compareModels')
            .addSeparator()
            .addItem('View Current Models', 'viewCurrentModels')
            .addItem('Refresh Models', 'refreshModelsMenu')
            .addSeparator()
            .addItem('Shorten', 'shorten')
            .addItem('Evaluate achievement', 'evaluate')
            .addItem('Categorize', 'findTheme')
            .addItem('Get judgement', 'getJudgement')
            .addItem('Get KPI', 'getKeyPerformanceIndicator')
            .addItem('Get Work History as G Doc', 'getWorkHistoryAsGDoc')
            .addItem('Generate resume', 'showModal')
            .addItem('Sort', 'sortSheet')
            .addItem('Create ID', 'createID')
            .addItem('Customize', 'createCustomization')
            .addSeparator()
            .addItem('Update Table of Contents', 'generateTableOfContents')
            .addToUi();
    }
}

;// ./src/ui/DialogService.ts
/**
 * Dialog Service - Manages dialogs and alerts
 *
 * @module ui/DialogService
 */
/**
 * Service for managing dialogs and alerts
 */
class DialogService {
    /**
     * Show modal dialog
     * @param templateName - HTML template file name
     * @param title - Dialog title
     * @param width - Dialog width (optional)
     * @param height - Dialog height (optional)
     */
    static showModal(templateName, title, width = null, height = null) {
        let html = HtmlService.createTemplateFromFile(templateName).evaluate();
        if (width)
            html = html.setWidth(width);
        if (height)
            html = html.setHeight(height);
        SpreadsheetApp.getUi().showModalDialog(html, title);
    }
    /**
     * Show alert dialog
     * @param message - Alert message
     * @param title - Alert title (optional)
     */
    static showAlert(message, title = 'Alert') {
        SpreadsheetApp.getUi().alert(title, message, SpreadsheetApp.getUi().ButtonSet.OK);
    }
    /**
     * Show prompt dialog
     * @param message - Prompt message
     * @param title - Prompt title
     * @returns User input or null if cancelled
     */
    static showPrompt(message, title = 'Input') {
        const ui = SpreadsheetApp.getUi();
        const response = ui.prompt(title, message, ui.ButtonSet.OK_CANCEL);
        if (response.getSelectedButton() === ui.Button.OK) {
            return response.getResponseText();
        }
        return null;
    }
    /**
     * Show link in modal dialog
     * @param url - URL to display
     * @param title - Dialog title
     */
    static showLink(url, title = 'Document Created') {
        const htmlContent = `<p><a href="${url}" target="_blank">${url}</a></p>`;
        const htmlOutput = HtmlService.createHtmlOutput(htmlContent).setWidth(300).setHeight(100);
        SpreadsheetApp.getUi().showModalDialog(htmlOutput, title);
    }
}

;// ./src/entry-points/index.ts
/**
 * Entry Points - Global functions exposed to Google Apps Script
 *
 * @module entry-points
 */













/**
 * Global services object - initialized on first use
 */
let SERVICES = null;
/**
 * Initialize all services
 * @returns Services object
 */
function initializeServices() {
    if (SERVICES)
        return SERVICES;
    const sheetService = new SheetService();
    const configService = new ConfigService(sheetService);
    const aiService = new AIService(configService);
    const documentService = new DocumentService();
    const achievementService = new AchievementService(aiService);
    const evaluationService = new EvaluationService(aiService);
    const customizationService = new CustomizationService(aiService, sheetService);
    const resumeFormatter = new ResumeFormatter(documentService, sheetService);
    const workHistoryExporter = new WorkHistoryExporter(documentService, sheetService, evaluationService);
    SERVICES = {
        sheet: sheetService,
        config: configService,
        ai: aiService,
        document: documentService,
        achievement: achievementService,
        evaluation: evaluationService,
        customization: customizationService,
        resumeFormatter: resumeFormatter,
        workHistoryExporter: workHistoryExporter,
    };
    return SERVICES;
}
/**
 * Triggered when spreadsheet is opened
 * @param _e - Event object (unused)
 */
function onOpen(_e) {
    try {
        const ui = SpreadsheetApp.getUi();
        MenuService.createCustomMenu(ui);
    }
    catch (error) {
        Logger.error('Error in onOpen', error);
    }
}
/**
 * Generate achievement from current row
 * Menu item: "Generate summary"
 * Generates CV version first, then LinkedIn version, writing to each column automatically.
 */
function fetch() {
    try {
        const services = initializeServices();
        const { row, headers, rowIndex } = services.sheet.getActiveRowData(CONFIG.SHEETS.STORY_BANK);
        const cvColIndex = headers.findIndex((h) => h && String(h).toLowerCase().includes('cv'));
        const linkedinColIndex = headers.findIndex((h) => h && String(h).toLowerCase().includes('linkedin'));
        if (cvColIndex < 0 && linkedinColIndex < 0) {
            DialogService.showAlert('Could not find CV or LinkedIn columns in sheet headers.');
            return;
        }
        const requiredCols = [
            CONFIG.COLUMNS.STORY_BANK.CHALLENGE,
            CONFIG.COLUMNS.STORY_BANK.ACTIONS,
            CONFIG.COLUMNS.STORY_BANK.RESULT,
        ];
        const missingCols = requiredCols.filter((c) => headers.indexOf(c) < 0);
        if (missingCols.length > 0) {
            DialogService.showAlert(`Missing required column(s): ${missingCols.join(', ')}. Check header row spelling.`);
            return;
        }
        const challenge = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.CHALLENGE)];
        const actions = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.ACTIONS)];
        const result = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.RESULT)];
        const client = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.CLIENT)];
        if (cvColIndex >= 0) {
            Logger.log(`Generating CV summary for row ${rowIndex}, col ${cvColIndex + 1}`);
            const cvSummary = services.achievement.generateAchievement(challenge, actions, result, client, 'cv');
            services.sheet.setCellValue(CONFIG.SHEETS.STORY_BANK, rowIndex, cvColIndex + 1, cvSummary);
            Logger.log(`CV summary written: ${cvSummary.length} chars`);
        }
        else {
            Logger.warn('CV column not found — skipping CV generation');
        }
        if (linkedinColIndex >= 0) {
            try {
                Logger.log(`Generating LinkedIn summary for row ${rowIndex}, col ${linkedinColIndex + 1}`);
                const linkedinSummary = services.achievement.generateAchievement(challenge, actions, result, client, 'linkedin');
                services.sheet.setCellValue(CONFIG.SHEETS.STORY_BANK, rowIndex, linkedinColIndex + 1, linkedinSummary);
                Logger.log(`LinkedIn summary written: ${linkedinSummary.length} chars`);
            }
            catch (linkedinError) {
                Logger.warn(`LinkedIn generation failed: ${linkedinError.message}`);
                DialogService.showAlert(`CV saved. LinkedIn generation failed: ${linkedinError.message}`);
            }
        }
        else {
            Logger.warn('LinkedIn column not found — skipping LinkedIn generation');
        }
    }
    catch (error) {
        Logger.error('Error in fetch', error);
        DialogService.showAlert(`Error generating achievement: ${error.message}`);
    }
}
/**
 * Shorten achievement in current cell
 * Menu item: "Shorten"
 */
function shorten() {
    try {
        const services = initializeServices();
        const { row, headers } = services.sheet.getActiveRowData(CONFIG.SHEETS.STORY_BANK);
        const achievement = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.ACHIEVEMENT)];
        const shortened = services.achievement.shortenAchievement(achievement);
        const currentCell = services.sheet.getActiveCell();
        currentCell.setValue(shortened);
    }
    catch (error) {
        Logger.error('Error in shorten', error);
        DialogService.showAlert(`Error shortening achievement: ${error.message}`);
    }
}
/**
 * Evaluate achievement in current row
 * Menu item: "Evaluate achievement"
 * Note: Renamed from 'eval' to 'evaluate' (eval is reserved word)
 */
function evaluate() {
    try {
        const services = initializeServices();
        const sheet = services.sheet.getSheet('Work History');
        const data = sheet.getDataRange().getValues();
        const headers = data[0];
        const currentCell = sheet.getActiveCell();
        const rowIndex = currentCell.getRow();
        const row = sheet.getRange(`${rowIndex}:${rowIndex}`).getValues()[0] || [];
        const achievement = row[headers.indexOf('Resume Bullet Point')];
        const prompt = `Does the following describe something accomplished by more of a "Doer" or "Achiever"?

${achievement}

Return either "Doer" or "Achiever" as output.`;
        const summary = services.ai.query(prompt, { maxTokens: CONFIG.AI.MAX_TOKENS.CATEGORIZATION });
        currentCell.setValue(summary);
    }
    catch (error) {
        Logger.error('Error in evaluate', error);
        DialogService.showAlert(`Error evaluating achievement: ${error.message}`);
    }
}
/**
 * Find theme/category for achievement
 * Menu item: "Categorize"
 */
function findTheme() {
    try {
        const services = initializeServices();
        const sheet = services.sheet.getSheet(CONFIG.SHEETS.STORY_BANK);
        const data = sheet.getDataRange().getValues();
        const headers = data[0];
        const currentCell = sheet.getActiveCell();
        const rowIndex = currentCell.getRow();
        const row = sheet.getRange(`${rowIndex}:${rowIndex}`).getValues()[0] || [];
        const achievement = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.ACHIEVEMENT)];
        // Get functions from sheet
        const functionsSheet = services.sheet.getSheet(CONFIG.SHEETS.FUNCTION);
        const functionsData = functionsSheet
            .getRange('F2:F')
            .getValues()
            .flat()
            .filter((r) => r !== '');
        const category = services.achievement.categorizeAchievement(achievement, functionsData);
        currentCell.setValue(category);
    }
    catch (error) {
        Logger.error('Error in findTheme', error);
        DialogService.showAlert(`Error finding theme: ${error.message}`);
    }
}
/**
 * Get judgement score for achievement
 * Menu item: "Get judgement"
 */
function getJudgement() {
    try {
        const services = initializeServices();
        const sheet = services.sheet.getSheet('Work History');
        const data = sheet.getDataRange().getValues();
        const headers = data[0];
        const currentCell = sheet.getActiveCell();
        const rowIndex = currentCell.getRow();
        const row = sheet.getRange(`${rowIndex}:${rowIndex}`).getValues()[0] || [];
        const achievement = row[headers.indexOf('Resume Bullet Point')];
        const score = services.evaluation.getJudgement(achievement);
        currentCell.setValue(score);
    }
    catch (error) {
        Logger.error('Error in getJudgement', error);
        DialogService.showAlert(`Error getting judgement: ${error.message}`);
    }
}
/**
 * Get KPI for achievement
 * Menu item: "Get KPI"
 */
function getKeyPerformanceIndicator() {
    try {
        const services = initializeServices();
        const sheet = services.sheet.getSheet('Work History');
        const data = sheet.getDataRange().getValues();
        const headers = data[0];
        const currentCell = sheet.getActiveCell();
        const rowIndex = currentCell.getRow();
        const row = sheet.getRange(`${rowIndex}:${rowIndex}`).getValues()[0] || [];
        const achievement = row[headers.indexOf('Resume Bullet Point')];
        // Get KPIs
        const kpiSheet = services.sheet.getSheet('Metrics : KPIs (business & function)');
        const lastRow = kpiSheet.getLastRow();
        const kpis = kpiSheet.getRange(2, 1, lastRow, 1).getValues().flat().filter(String).join('\n');
        const prompt = `Given the following achievement, under what single standard key performance indicator (KPI) from the following KPIs would it most likely belong?

ACHIEVEMENT: ${achievement}

KPIs: ${kpis}

Return only the KPI.`;
        const kpi = services.ai.query(prompt, { maxTokens: CONFIG.AI.MAX_TOKENS.CATEGORIZATION });
        currentCell.setValue(kpi);
    }
    catch (error) {
        Logger.error('Error in getKeyPerformanceIndicator', error);
        DialogService.showAlert(`Error getting KPI: ${error.message}`);
    }
}
/**
 * Export work history as Google Doc
 * Menu item: "Get Work History as G Doc"
 */
function getWorkHistoryAsGDoc() {
    try {
        const services = initializeServices();
        const url = services.workHistoryExporter.exportWorkHistory();
        DialogService.showLink(url, 'Work History Exported');
    }
    catch (error) {
        Logger.error('Error in getWorkHistoryAsGDoc', error);
        DialogService.showAlert(`Error exporting work history: ${error.message}`);
    }
}
/**
 * Show modal for resume generation
 * Menu item: "Generate resume"
 */
function showModal() {
    try {
        DialogService.showModal('dialog', 'Sample Modal');
    }
    catch (error) {
        Logger.error('Error in showModal', error);
        DialogService.showAlert(`Error showing modal: ${error.message}`);
    }
}
/**
 * Sort the active sheet
 * Menu item: "Sort"
 */
function sortSheet() {
    try {
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
        const headerRowRange = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues();
        const headers = headerRowRange[0];
        const seqColIndex = headers.indexOf('Seq') + 1;
        const clientColIndex = headers.indexOf('Client') + 1;
        const wowColIndex = headers.indexOf('Wow') + 1;
        const dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn());
        dataRange.sort([
            { column: seqColIndex, ascending: true },
            { column: clientColIndex, ascending: true },
            { column: wowColIndex, ascending: false },
        ]);
    }
    catch (error) {
        Logger.error('Error in sortSheet', error);
        DialogService.showAlert(`Error sorting sheet: ${error.message}`);
    }
}
/**
 * Create unique ID for achievement
 * Menu item: "Create ID"
 */
function createID() {
    try {
        const services = initializeServices();
        const { row, headers } = services.sheet.getActiveRowData(CONFIG.SHEETS.STORY_BANK);
        const achievement = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.ACHIEVEMENT)];
        const uniqueID = services.achievement.generateUniqueId(achievement);
        const currentCell = services.sheet.getActiveCell();
        currentCell.setValue(uniqueID);
    }
    catch (error) {
        Logger.error('Error in createID', error);
        DialogService.showAlert(`Error creating ID: ${error.message}`);
    }
}
/**
 * Create customization for job
 * Menu item: "Customize"
 */
function createCustomization() {
    try {
        const services = initializeServices();
        const customized = services.customization.customizeResume();
        const sheet = services.sheet.getSheet(CONFIG.SHEETS.CUSTOMIZER);
        const currentCell = sheet.getActiveCell();
        currentCell.setValue(customized);
    }
    catch (error) {
        Logger.error('Error in createCustomization', error);
        DialogService.showAlert(`Error creating customization: ${error.message}`);
    }
}
/**
 * Generate achievement using specific model
 * @param modelName - Name of model ('claude', 'gemini', 'openai', 'mistral', 'cohere')
 */
function fetchWithModel(modelName) {
    try {
        const services = initializeServices();
        const { row, headers, rowIndex } = services.sheet.getActiveRowData(CONFIG.SHEETS.STORY_BANK);
        const cvColIndex = headers.findIndex((h) => h && String(h).toLowerCase().includes('cv'));
        const linkedinColIndex = headers.findIndex((h) => h && String(h).toLowerCase().includes('linkedin'));
        const challenge = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.CHALLENGE)];
        const actions = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.ACTIONS)];
        const result = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.RESULT)];
        const client = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.CLIENT)];
        for (const [audience, colIndex] of [
            ['cv', cvColIndex],
            ['linkedin', linkedinColIndex],
        ]) {
            if (colIndex < 0) {
                Logger.warn(`fetchWithModel: ${audience} column not found — skipping`);
                continue;
            }
            const maxTokens = audience === 'linkedin'
                ? CONFIG.AI.MAX_TOKENS.ACHIEVEMENT_LINKEDIN
                : CONFIG.AI.MAX_TOKENS.ACHIEVEMENT_CV;
            Logger.log(`fetchWithModel(${modelName}): generating ${audience}, col ${colIndex + 1}, maxTokens=${maxTokens}`);
            const prompt = services.achievement.buildPrompt(challenge, actions, result, client, audience);
            const response = services.ai.query(prompt, { provider: modelName, maxTokens });
            services.sheet.setCellValue(CONFIG.SHEETS.STORY_BANK, rowIndex, colIndex + 1, response);
            Logger.log(`fetchWithModel(${modelName}): ${audience} written, ${response.length} chars`);
        }
    }
    catch (error) {
        Logger.error(`Error in fetchWithModel with ${modelName}`, error);
        throw new Error(`Failed to generate with ${modelName}: ${error.message}`);
    }
}
/**
 * Generate achievement without writing to cell (for comparison)
 * @param modelName - Name of model ('claude', 'gemini', 'openai', 'mistral', 'cohere')
 * @returns Result object with text, latency, prompt, and config
 */
function generateAchievementWithModel(modelName) {
    try {
        const startTime = new Date().getTime();
        const services = initializeServices();
        const { row, headers } = services.sheet.getActiveRowData(CONFIG.SHEETS.STORY_BANK);
        const targetAudience = 'cv';
        Logger.log(`generateAchievementWithModel(${modelName}): audience=${targetAudience}`);
        const challenge = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.CHALLENGE)];
        const actions = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.ACTIONS)];
        const result = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.RESULT)];
        const client = row[headers.indexOf(CONFIG.COLUMNS.STORY_BANK.CLIENT)];
        const prompt = services.achievement.buildPrompt(challenge, actions, result, client, targetAudience);
        // Reasoning models need a flat high cap — their thinking chain alone can consume thousands
        // of tokens before producing the final answer; scaling from the small output budget doesn't work
        const modelId = services.ai['modelMap'][modelName];
        const isReasoningModel = modelId &&
            (modelId.includes('deepseek') || modelId.includes('gpt-5.5') || /\/o\d/.test(modelId));
        const maxTokens = isReasoningModel
            ? CONFIG.AI.MAX_TOKENS.ACHIEVEMENT_REASONING
            : CONFIG.AI.MAX_TOKENS.ACHIEVEMENT_CV;
        Logger.log(`generateAchievementWithModel: maxTokens=${maxTokens} (reasoning=${isReasoningModel})`);
        const config = {
            provider: modelName,
            model: services.ai['modelMap'][modelName] || '',
            maxTokens: maxTokens,
            targetAudience: targetAudience,
            columnHeader: CONFIG.COLUMNS.STORY_BANK.CV,
        };
        const response = services.ai.query(prompt, {
            provider: modelName,
            maxTokens: maxTokens,
        });
        const endTime = new Date().getTime();
        const latencyMs = endTime - startTime;
        Logger.log(`Generated achievement using ${modelName}: ${response.length} chars in ${latencyMs}ms`);
        // Log if response is empty
        if (!response || response.length === 0) {
            Logger.warn(`Empty response from ${modelName}!`);
        }
        return {
            text: response || '',
            latencyMs: latencyMs,
            prompt: prompt,
            config: config,
        };
    }
    catch (error) {
        Logger.error(`Error in generateAchievementWithModel with ${modelName}`, error);
        throw new Error(`Failed to generate with ${modelName}: ${error.message}`);
    }
}
/**
 * Set active cell value to selected model output
 * @param content - Achievement text to set
 */
function setActiveCellValue(content) {
    try {
        const services = initializeServices();
        const currentCell = services.sheet.getActiveCell();
        currentCell.setValue(content);
        Logger.log(`Set active cell to: ${content.substring(0, 50)}...`);
    }
    catch (error) {
        Logger.error('Error in setActiveCellValue', error);
        throw new Error(`Failed to set cell value: ${error.message}`);
    }
}
/**
 * Log model choice and all outputs to "AI Feedback" sheet for RLHF
 * Called fire-and-forget from sidebar after user clicks "Choose This"
 * @param chosenModelId - Key of chosen model (e.g. 'claude')
 * @param rationale - Optional notes from user
 * @param allOutputs - Map of model key → generated text for all models
 */
function logModelChoice(chosenModelId, rationale, allOutputs) {
    try {
        const services = initializeServices();
        const { rowIndex } = services.sheet.getActiveRowData(CONFIG.SHEETS.STORY_BANK);
        const FEEDBACK_SHEET = 'AI Feedback';
        const HEADERS = [
            'Timestamp',
            'Story Row',
            'Chosen Model',
            'Rationale',
            'Claude',
            'Gemini',
            'GPT',
            'Mistral',
            'Cohere',
        ];
        const sheet = services.sheet.ensureSheet(FEEDBACK_SHEET);
        if (sheet.getLastRow() === 0) {
            sheet.appendRow(HEADERS);
        }
        const row = [
            new Date().toISOString(),
            rowIndex,
            chosenModelId,
            rationale || '',
            allOutputs['claude'] || '',
            allOutputs['gemini'] || '',
            allOutputs['openai'] || '',
            allOutputs['mistral'] || '',
            allOutputs['cohere'] || '',
        ];
        sheet.appendRow(row);
        Logger.log(`logModelChoice: ${chosenModelId} row=${rowIndex}`);
    }
    catch (error) {
        Logger.error('Error in logModelChoice', error);
    }
}
/**
 * Choose model for single generation
 * Menu item: "Choose Model"
 */
function chooseModel() {
    // This function requires HTML template - skipping for now
    // Would need to migrate HTML templates as well
    DialogService.showAlert('Choose Model feature requires HTML template migration');
}
/**
 * Compare models side-by-side
 * Menu item: "Compare Models"
 */
function compareModels() {
    try {
        const services = initializeServices();
        const models = services.ai['modelMap'];
        const claudeModel = models['claude'] || CONFIG.AI.FALLBACK_MODELS.CLAUDE;
        const geminiModel = models['gemini'] || CONFIG.AI.FALLBACK_MODELS.GEMINI;
        const openaiModel = models['openai'] || CONFIG.AI.FALLBACK_MODELS.OPENAI;
        const mistralModel = models['mistral'] || CONFIG.AI.FALLBACK_MODELS.MISTRAL;
        const cohereModel = models['cohere'] || CONFIG.AI.FALLBACK_MODELS.COHERE;
        const fmt = (id) => {
            const parts = id.split('/');
            const model = parts[1] || id;
            return model
                .replace(/-/g, ' ')
                .replace(/\b\w/g, (c) => c.toUpperCase())
                .substring(0, 50);
        };
        const claudeDisplay = fmt(claudeModel);
        const geminiDisplay = fmt(geminiModel);
        const openaiDisplay = fmt(openaiModel);
        const mistralDisplay = fmt(mistralModel);
        const cohereDisplay = fmt(cohereModel);
        const html = `<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <style>
    body{font-family:Arial,sans-serif;padding:20px;margin:0;background:#f5f5f5}
    .container{max-width:1200px;margin:0 auto}
    .controls{background:white;padding:20px;border-radius:8px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.1);text-align:center}
    .results{display:grid;grid-template-columns:repeat(5,1fr);gap:15px}
    .result-card{background:white;border-radius:8px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.1);min-height:250px;display:flex;flex-direction:column}
    .result-card h4{margin:0 0 10px;color:#1a73e8;border-bottom:2px solid #1a73e8;padding-bottom:8px;font-size:15px}
    .model-label{font-size:12px;color:#666;margin-bottom:15px}
    .result-content{flex:1;line-height:1.6;color:#333;font-size:14px;overflow-wrap:break-word}
    .loading{text-align:center;color:#999;font-style:italic;padding:40px 0}
    .char-count{font-size:12px;color:#666;margin-top:15px;padding-top:10px;border-top:1px solid #eee;font-weight:600}
    .metadata{font-size:11px;color:#666;margin-top:10px;padding:8px;background:#f8f9fa;border-radius:4px;font-family:monospace;display:none}
    .metadata-row{margin:4px 0;display:flex;justify-content:space-between;align-items:center}
    .metadata-label{font-weight:600;color:#555}
    .metadata-value{color:#333}
    .latency{color:#28a745;font-weight:600}
    .latency.slow{color:#ffc107}
    .latency.very-slow{color:#dc3545}
    .prompt-link{color:#1a73e8;text-decoration:none;cursor:pointer;font-size:11px}
    .prompt-link:hover{text-decoration:underline}
    .choose-btn{width:100%;padding:8px;margin-top:10px;background:#1a73e8;color:white;border:none;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;display:none}
    .choose-btn:hover{background:#1557b0}
    .choose-btn:disabled{background:#ccc;cursor:not-allowed}
    .choose-btn.success{background:#28a745}
    .notes-input{width:100%;box-sizing:border-box;margin-top:8px;padding:6px;border:1px solid #ddd;border-radius:4px;font-size:12px;font-family:Arial,sans-serif;resize:vertical;min-height:48px;display:none}
    .run-btn{padding:10px 28px;background:#1a73e8;color:white;border:none;border-radius:6px;font-size:15px;font-weight:600;cursor:pointer;margin-bottom:10px}
    .run-btn:hover{background:#1557b0}
    .run-btn:disabled{background:#ccc;cursor:not-allowed}
    .winner{background:#d4edda;border:2px solid #28a745}
    .winner h4{color:#28a745;border-bottom-color:#28a745}
    .winner-badge{display:inline-block;background:#28a745;color:white;padding:2px 8px;border-radius:12px;font-size:10px;margin-left:8px;font-weight:normal}
    .status{margin-top:15px;padding:10px;border-radius:4px;display:none;text-align:center}
    .status.error{background:#f8d7da;color:#721c24;display:block}
  </style>
</head>
<body>
  <div class="container">
    <div class="controls">
      <button class="run-btn" id="runBtn" onclick="startComparison()">&#9654; Run Comparison</button>
      <div id="status" class="status"></div>
    </div>
    <div class="results" id="results" style="display:none">
      <div class="result-card" id="resultClaude">
        <h4>🤖 ${claudeDisplay}</h4>
        <div class="model-label">${claudeModel}</div>
        <div class="result-content" id="contentClaude"><div class="loading">Pending...</div></div>
        <div class="char-count" id="countClaude"></div>
        <div class="metadata" id="metadataClaude"></div>
        <textarea class="notes-input" id="notesClaude" placeholder="Notes..."></textarea>
        <button class="choose-btn" id="chooseClaude" onclick="chooseModel('claude')">✓ Choose This</button>
      </div>
      <div class="result-card" id="resultGemini">
        <h4>🔮 ${geminiDisplay}</h4>
        <div class="model-label">${geminiModel}</div>
        <div class="result-content" id="contentGemini"><div class="loading">Pending...</div></div>
        <div class="char-count" id="countGemini"></div>
        <div class="metadata" id="metadataGemini"></div>
        <textarea class="notes-input" id="notesGemini" placeholder="Notes..."></textarea>
        <button class="choose-btn" id="chooseGemini" onclick="chooseModel('gemini')">✓ Choose This</button>
      </div>
      <div class="result-card" id="resultOpenAI">
        <h4>💬 ${openaiDisplay}</h4>
        <div class="model-label">${openaiModel}</div>
        <div class="result-content" id="contentOpenAI"><div class="loading">Pending...</div></div>
        <div class="char-count" id="countOpenAI"></div>
        <div class="metadata" id="metadataOpenAI"></div>
        <textarea class="notes-input" id="notesOpenAI" placeholder="Notes..."></textarea>
        <button class="choose-btn" id="chooseOpenAI" onclick="chooseModel('openai')">✓ Choose This</button>
      </div>
      <div class="result-card" id="resultMistral">
        <h4>⚡ ${mistralDisplay}</h4>
        <div class="model-label">${mistralModel}</div>
        <div class="result-content" id="contentMistral"><div class="loading">Pending...</div></div>
        <div class="char-count" id="countMistral"></div>
        <div class="metadata" id="metadataMistral"></div>
        <textarea class="notes-input" id="notesMistral" placeholder="Notes..."></textarea>
        <button class="choose-btn" id="chooseMistral" onclick="chooseModel('mistral')">✓ Choose This</button>
      </div>
      <div class="result-card" id="resultCohere">
        <h4>🔷 ${cohereDisplay}</h4>
        <div class="model-label">${cohereModel}</div>
        <div class="result-content" id="contentCohere"><div class="loading">Pending...</div></div>
        <div class="char-count" id="countCohere"></div>
        <div class="metadata" id="metadataCohere"></div>
        <textarea class="notes-input" id="notesCohere" placeholder="Notes..."></textarea>
        <button class="choose-btn" id="chooseCohere" onclick="chooseModel('cohere')">✓ Choose This</button>
      </div>
    </div>
  </div>
  <script>
    const MODELS=[
      {key:'claude',contentId:'contentClaude',countId:'countClaude',cardId:'resultClaude',buttonId:'chooseClaude',metadataId:'metadataClaude',notesId:'notesClaude'},
      {key:'gemini',contentId:'contentGemini',countId:'countGemini',cardId:'resultGemini',buttonId:'chooseGemini',metadataId:'metadataGemini',notesId:'notesGemini'},
      {key:'openai',contentId:'contentOpenAI',countId:'countOpenAI',cardId:'resultOpenAI',buttonId:'chooseOpenAI',metadataId:'metadataOpenAI',notesId:'notesOpenAI'},
      {key:'mistral',contentId:'contentMistral',countId:'countMistral',cardId:'resultMistral',buttonId:'chooseMistral',metadataId:'metadataMistral',notesId:'notesMistral'},
      {key:'cohere',contentId:'contentCohere',countId:'countCohere',cardId:'resultCohere',buttonId:'chooseCohere',metadataId:'metadataCohere',notesId:'notesCohere'}
    ];
    var modelResults={};
    function startComparison(){
      var btn=document.getElementById('runBtn');
      btn.disabled=true;
      btn.innerHTML='Running...';
      document.getElementById('results').style.display='grid';
      runComparison();
    }
    function runComparison(){
      var status=document.getElementById('status');
      status.textContent='Generating all models...';
      status.style.display='block';
      MODELS.forEach(function(m){
        document.getElementById(m.contentId).innerHTML='<div class="loading">Pending...</div>';
        document.getElementById(m.countId).textContent='';
        document.getElementById(m.metadataId).style.display='none';
        document.getElementById(m.cardId).classList.remove('winner');
        document.getElementById(m.buttonId).style.display='none';
        document.getElementById(m.notesId).value='';
        document.getElementById(m.notesId).style.display='none';
        var h=document.getElementById(m.cardId).querySelector('h4');
        var b=h.querySelector('.winner-badge');if(b)b.remove();
      });
      modelResults={};
      var completed=0;
      var TIMEOUT_MS=60000;
      var STAGGER_MS=1500;
      MODELS.forEach(function(m,i){
        setTimeout(function(){
          document.getElementById(m.contentId).innerHTML='<div class="loading">Generating...</div>';
          var timer=setTimeout(function(){
            if(!modelResults[m.key]){
              document.getElementById(m.contentId).innerHTML='<div style="color:#e67e22;font-style:italic">⏱ Timed out after 60s</div>';
              completed++;
              if(completed===MODELS.length){status.textContent='Completed with timeouts';status.className='status error';var b=document.getElementById('runBtn');b.disabled=false;b.innerHTML='&#9654; Run Again';}
              else{status.textContent='Generating... ('+completed+'/'+MODELS.length+')';}
            }
          },TIMEOUT_MS);
          google.script.run
            .withSuccessHandler(function(result){
              clearTimeout(timer);
              modelResults[m.key]=result;
              displayResult(m.contentId,m.countId,result,m.key);
              completed++;
              if(completed===MODELS.length){finishComparison(modelResults);status.textContent='All models completed!';status.className='status';var b=document.getElementById('runBtn');b.disabled=false;b.innerHTML='&#9654; Run Again';}
              else{status.textContent='Generating... ('+completed+'/'+MODELS.length+')';}
            })
            .withFailureHandler(function(error){
              clearTimeout(timer);
              document.getElementById(m.contentId).innerHTML='<div style="color:red">Error: '+error.message+'</div>';
              completed++;
              if(completed===MODELS.length){status.textContent='Completed with errors';status.className='status error';var b=document.getElementById('runBtn');b.disabled=false;b.innerHTML='&#9654; Run Again';}
              else{status.textContent='Generating... ('+completed+'/'+MODELS.length+')';}
            })
            .generateAchievementWithModel(m.key);
        },i*STAGGER_MS);
      });
    }
    function chooseModel(key){
      var m=MODELS.find(function(x){return x.key===key;});
      if(!m){alert('Model not found');return;}
      var r=modelResults[key];
      if(!r||!r.text){alert('No result available');return;}
      var btn=document.getElementById(m.buttonId);
      var notes=document.getElementById(m.notesId).value||'';
      var allOutputs={};
      MODELS.forEach(function(x){allOutputs[x.key]=(modelResults[x.key]&&modelResults[x.key].text)||'';});
      btn.disabled=true;btn.textContent='Applying...';
      google.script.run
        .withSuccessHandler(function(){btn.textContent='✓ Applied!';btn.classList.add('success');setTimeout(function(){google.script.host.close();},1000);})
        .withFailureHandler(function(e){btn.disabled=false;btn.textContent='✓ Choose This';alert('Error: '+e.message);})
        .setActiveCellValue(r.text);
      google.script.run.logModelChoice(key,notes,allOutputs);
    }
    function displayResult(contentId,countId,r,key){
      var text=r.text||'';
      document.getElementById(contentId)[text.length===0?'innerHTML':'textContent']=text.length===0?'<div style="color:#e67e22;font-style:italic">⚠️ Empty response</div>':text;
      document.getElementById(countId).textContent='Characters: '+text.length;
      var m=MODELS.find(function(x){return x.key===key;});
      if(!m)return;
      var el=document.getElementById(m.metadataId);
      var cls='latency'+(r.latencyMs>5000?' very-slow':r.latencyMs>2000?' slow':'');
      el.innerHTML='<div class="metadata-row"><span class="metadata-label">⚡ Latency:</span><span class="'+cls+'">'+(r.latencyMs/1000).toFixed(2)+'s</span></div>'
        +'<div class="metadata-row"><span class="metadata-label">Model ID:</span><span class="metadata-value">'+r.config.model+'</span></div>'
        +'<div class="metadata-row"><span class="metadata-label">Max Tokens:</span><span class="metadata-value">'+r.config.maxTokens+'</span></div>'
        +'<div class="metadata-row"><span class="metadata-label">Audience:</span><span class="metadata-value">'+r.config.targetAudience+'</span></div>'
        +'<div class="metadata-row"><span class="metadata-label">Prompt:</span><a class="prompt-link" onclick="showPrompt(&quot;'+key+'&quot;)">View Full Prompt</a></div>';
      el.style.display='block';
      document.getElementById(m.notesId).style.display='block';
      document.getElementById(m.buttonId).style.display='block';
    }
    function showPrompt(key){
      var r=modelResults[key];
      if(!r||!r.prompt){alert('Prompt not available');return;}
      var w=window.open('','Prompt','width=800,height=600,scrollbars=yes');
      w.document.write('<html><head><title>Prompt for '+key+'</title><style>body{font-family:monospace;padding:20px;white-space:pre-wrap;word-wrap:break-word}h3{font-family:Arial}</style></head><body><h3>Full Prompt — '+key.toUpperCase()+'</h3><hr>'+r.prompt+'</body></html>');
      w.document.close();
    }
    function finishComparison(results){
      var shortest=null,shortestLen=Infinity,shortestKey=null;
      Object.keys(results).forEach(function(k){
        var t=results[k].text||results[k];
        if(t.length>=40&&t.length<shortestLen){shortest=t;shortestLen=t.length;shortestKey=k;}
      });
      if(shortestKey){
        var wm=MODELS.find(function(m){return m.key===shortestKey;});
        if(wm){
          document.getElementById(wm.cardId).classList.add('winner');
          document.getElementById(wm.cardId).querySelector('h4').innerHTML+='<span class="winner-badge">Most Concise</span>';
        }
      }
    }
    window.addEventListener('load', startComparison);
  </script>
</body>
</html>`;
        const htmlOutput = HtmlService.createHtmlOutput(html).setWidth(1250).setHeight(650);
        SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Compare All AI Models');
    }
    catch (error) {
        Logger.error('Error in compareModels', error);
        DialogService.showAlert(`Error showing comparison: ${error.message}`);
    }
}
/**
 * View currently active AI models
 * Menu item: "View Current Models"
 */
function viewCurrentModels() {
    try {
        const services = initializeServices();
        const models = services.ai['modelMap'];
        const claudeModel = models['claude'] || CONFIG.AI.FALLBACK_MODELS.CLAUDE;
        const geminiModel = models['gemini'] || CONFIG.AI.FALLBACK_MODELS.GEMINI;
        const openaiModel = models['openai'] || CONFIG.AI.FALLBACK_MODELS.OPENAI;
        const mistralModel = models['mistral'] || CONFIG.AI.FALLBACK_MODELS.MISTRAL;
        const cohereModel = models['cohere'] || CONFIG.AI.FALLBACK_MODELS.COHERE;
        const ui = SpreadsheetApp.getUi();
        const message = `Current AI Models:\n\n` +
            `Claude: ${claudeModel}\n` +
            `Gemini: ${geminiModel}\n` +
            `OpenAI: ${openaiModel}\n` +
            `Mistral: ${mistralModel}\n` +
            `Cohere: ${cohereModel}\n\n` +
            `These models are refreshed daily from OpenRouter.\n` +
            `Use "Refresh Models" to force an update.`;
        ui.alert('Current AI Models', message, ui.ButtonSet.OK);
    }
    catch (error) {
        Logger.error('Error in viewCurrentModels', error);
        DialogService.showAlert(`Error viewing models: ${error.message}`);
    }
}
/**
 * Force refresh AI models from OpenRouter
 * Menu item: "Refresh Models"
 */
function refreshModelsMenu() {
    try {
        const ui = SpreadsheetApp.getUi();
        // Confirm refresh
        const response = ui.alert('Refresh AI Models', 'This will fetch the latest models from OpenRouter.\n\n' + 'Do you want to continue?', ui.ButtonSet.YES_NO);
        if (response !== ui.Button.YES) {
            return;
        }
        const services = initializeServices();
        const newModels = services.ai.refreshModels();
        const message = `Models refreshed successfully!\n\n` +
            `Claude: ${newModels['claude']}\n` +
            `Gemini: ${newModels['gemini']}\n` +
            `OpenAI: ${newModels['openai']}\n` +
            `Mistral: ${newModels['mistral']}\n` +
            `Cohere: ${newModels['cohere']}`;
        ui.alert('Models Updated', message, ui.ButtonSet.OK);
    }
    catch (error) {
        Logger.error('Error in refreshModelsMenu', error);
        SpreadsheetApp.getUi().alert('Refresh Failed', `Error refreshing models: ${error.message}\n\n` + 'Using cached models.', SpreadsheetApp.getUi().ButtonSet.OK);
    }
}
/**
 * One-time setup function for OpenRouter API key
 * Run this manually to configure API credentials
 */
function setupAPIKeys() {
    try {
        const ui = SpreadsheetApp.getUi();
        // Show info message
        ui.alert('OpenRouter Setup', 'This script uses OpenRouter for unified AI model access.\n\n' +
            'One API key for all models (Claude, GPT-4, Gemini, etc.)\n' +
            'Simple pay-as-you-go pricing\n' +
            'No vendor lock-in\n\n' +
            'Get your API key at: https://openrouter.ai/keys', ui.ButtonSet.OK);
        // OpenRouter API Key
        const openrouterResponse = ui.prompt('Setup: OpenRouter API Key', 'Enter your OpenRouter API key:', ui.ButtonSet.OK_CANCEL);
        if (openrouterResponse.getSelectedButton() === ui.Button.OK) {
            const openrouterKey = openrouterResponse.getResponseText();
            PropertiesService.getScriptProperties().setProperty('OPENROUTER_API_KEY', openrouterKey);
            Logger.log('OpenRouter API key saved');
            ui.alert('Setup Complete', 'OpenRouter API key has been saved successfully!\n\nYou can now use all AI features.', ui.ButtonSet.OK);
        }
        else {
            ui.alert('Setup Cancelled', 'No API key was saved.', ui.ButtonSet.OK);
        }
    }
    catch (error) {
        Logger.error('Error in setupAPIKeys', error);
        SpreadsheetApp.getUi().alert(`Error during setup: ${error.message}`);
    }
}
/**
 * Handle resume generation
 * Called from HTML dialog
 */
function handleGenerate() {
    try {
        const services = initializeServices();
        const url = services.resumeFormatter.generateResume();
        DialogService.showLink(url, 'Resume Generated');
    }
    catch (error) {
        Logger.error('Error in handleGenerate', error);
        DialogService.showAlert(`Error generating resume: ${error.message}`);
    }
}
/**
 * Include HTML file content (for templating)
 * @param filename - HTML file name
 * @returns HTML content
 */
function include(filename) {
    return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
}
/**
 * Rebuild the Table of Contents in the first sheet.
 * Creates clickable HYPERLINK formulas for every subsequent sheet.
 * Menu item: "Update Table of Contents"
 */
function generateTableOfContents() {
    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheets = ss.getSheets();
        const tocSheet = sheets[0];
        const ssId = ss.getId();
        if (!tocSheet) {
            DialogService.showAlert('No sheets found in this spreadsheet.');
            return;
        }
        tocSheet.clear();
        tocSheet
            .getRange(1, 1, 1, 2)
            .setValues([['Sheet Name', 'Link']])
            .setFontWeight('bold');
        const data = [];
        for (let i = 1; i < sheets.length; i++) {
            const sheet = sheets[i];
            if (!sheet)
                continue;
            const sheetName = sheet.getName();
            const gid = sheet.getSheetId();
            const link = `=HYPERLINK("https://docs.google.com/spreadsheets/d/${ssId}/edit#gid=${gid}","${sheetName}")`;
            data.push([sheetName, link]);
        }
        if (data.length > 0) {
            tocSheet.getRange(2, 1, data.length, 2).setValues(data);
        }
        SpreadsheetApp.getUi().alert('Table of Contents updated!');
    }
    catch (error) {
        Logger.error('Error in generateTableOfContents', error);
        DialogService.showAlert(`Error generating table of contents: ${error.message}`);
    }
}
__webpack_require__.g.onOpen = onOpen;
__webpack_require__.g.fetch = fetch;
__webpack_require__.g.shorten = shorten;
__webpack_require__.g.evaluate = evaluate;
__webpack_require__.g.findTheme = findTheme;
__webpack_require__.g.getJudgement = getJudgement;
__webpack_require__.g.getKeyPerformanceIndicator = getKeyPerformanceIndicator;
__webpack_require__.g.getWorkHistoryAsGDoc = getWorkHistoryAsGDoc;
__webpack_require__.g.showModal = showModal;
__webpack_require__.g.sortSheet = sortSheet;
__webpack_require__.g.createID = createID;
__webpack_require__.g.createCustomization = createCustomization;
__webpack_require__.g.fetchWithModel = fetchWithModel;
__webpack_require__.g.generateAchievementWithModel = generateAchievementWithModel;
__webpack_require__.g.setActiveCellValue = setActiveCellValue;
__webpack_require__.g.logModelChoice = logModelChoice;
__webpack_require__.g.chooseModel = chooseModel;
__webpack_require__.g.compareModels = compareModels;
__webpack_require__.g.viewCurrentModels = viewCurrentModels;
__webpack_require__.g.refreshModelsMenu = refreshModelsMenu;
__webpack_require__.g.setupAPIKeys = setupAPIKeys;
__webpack_require__.g.handleGenerate = handleGenerate;
__webpack_require__.g.include = include;
__webpack_require__.g.generateTableOfContents = generateTableOfContents;

;// ./src/index.ts
/**
 * Main entry point for the apps-script-resume module
 * Exports all public APIs and entry points
 */
// Export configuration

// Export utilities



// Export data services



// Export AI services



// Export document services

// Export business services





// Export UI services


// Export all entry points (global functions for Google Apps Script)



/**
 * Global configuration object containing all constants and settings
 *
 * @module config
 */
export interface SheetNames {
    STORY_BANK: string;
    COMPANIES: string;
    CUSTOMIZER: string;
    CONFIG: string;
    CV_VIEW: string;
    CV_TXT: string;
    WORK_HISTORY: string;
    FUNCTION: string;
    POSITIONING: string;
    CUSTOMIZATION: string;
}
export interface StoryBankColumns {
    COMPANY: string;
    SEQUENCE: string;
    CHALLENGE: string;
    ACTIONS: string;
    RESULT: string;
    CLIENT: string;
    ACHIEVEMENT: string;
    SHORT: string;
    LONG: string;
    RESUME_BULLET_POINT: string;
    WOW: string;
    DOMAIN: string;
    INCLUDE: string;
    FOCUS: string;
    ID: string;
    TEAL_ID: string;
    TIMING: string;
    CV: string;
    LINKEDIN: string;
}
export interface CompaniesColumns {
    COMPANY: string;
    SEQUENCE: string;
    TITLE: string;
    DURATION: string;
    SUMMARY: string;
    STACK: string;
    DOMAIN: string;
}
export interface CustomizerColumns {
    JOB_DESCRIPTION: number;
    RESUME: number;
}
export interface ColumnMappings {
    STORY_BANK: StoryBankColumns;
    COMPANIES: CompaniesColumns;
    CUSTOMIZER: CustomizerColumns;
}
export interface FallbackModels {
    CLAUDE: string;
    GEMINI: string;
    OPENAI: string;
    MISTRAL: string;
    COHERE: string;
}
export interface ModelDiscoverySettings {
    CACHE_DURATION_HOURS: number;
    PREFER_LATEST: boolean;
    MIN_CONTEXT: number;
}
export interface MaxTokens {
    ACHIEVEMENT_CV: number;
    ACHIEVEMENT_LINKEDIN: number;
    ACHIEVEMENT: number;
    RESUME: number;
    CATEGORIZATION: number;
    ARCHETYPE: number;
}
export interface AISettings {
    ENDPOINT: string;
    MODELS_ENDPOINT: string;
    FALLBACK_MODELS: FallbackModels;
    DISCOVERY: ModelDiscoverySettings;
    MAX_TOKENS: MaxTokens;
    TEAL_BULLET_POINT_MIN_LENGTH: number;
    TEAL_BULLET_POINT_MAX_LENGTH: number;
    SHORT_SCALE: number;
    LONG_SCALE: number;
    SCALE_FACTOR: number;
    REASONING_MULTIPLIER: number;
}
export interface DocumentSettings {
    DEFAULT_PADDING: number;
    DEFAULT_FONT_SIZE: number;
    RESUME_TEMPLATE_ID: string;
    INCLUDE_TECH_STACK: boolean;
}
export interface Thresholds {
    WOW_MIN: number;
    WOW_THRESHOLD: number;
    SEQUENCE_THRESHOLD: number;
    COMPLETE_WOW: number;
    COMPLETE_SEQUENCE: number;
}
export interface Prompts {
    SYSTEM_ROLE: string;
    BULLET_CHAR: string;
    MARKS: string;
    SPECIFICS: string;
    FORMATTING_TEMPLATE: string;
    NORMALIZE: string;
    IS_IMPACTFUL: string;
    ACHIEVEMENT_SIMPLIFIED: string;
    ACHIEVEMENT_LINKEDIN_HOW: string;
    BEST_EFFORT: string;
}
export interface ContactInfo {
    NAME: string;
    LOCATION: string;
    PHONE: string;
    EMAIL: string;
    LINKEDIN: string;
}
export interface EducationItem {
    degree: string;
    details: string[];
}
export interface Config {
    SHEETS: SheetNames;
    COLUMNS: ColumnMappings;
    AI: AISettings;
    DOCUMENT: DocumentSettings;
    THRESHOLDS: Thresholds;
    STRENGTHS: string[];
    KEY_ACCOMPLISHMENTS: string[];
    PROMPTS: Prompts;
    CONTACT: ContactInfo;
    EDUCATION: EducationItem[];
    DEBUG: boolean;
}
/**
 * Global configuration object
 */
export declare const CONFIG: Config;
//# sourceMappingURL=index.d.ts.map
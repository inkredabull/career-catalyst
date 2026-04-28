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
  ACHIEVEMENT_REASONING: number;
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
export const CONFIG: Config = {
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
    SYSTEM_ROLE:
      'You are a professional, experienced copywriter specializing in writing resumes for executive product engineering roles.',

    BULLET_CHAR: 'Start with a Unicode bullet character e.g. U+2022',

    MARKS: `Omit any reference marks; do not use symbols like '*,' '**,' or '-.'
Omit use definite or indefinite articles such as 'the' or 'a'.
Do not end with a period.`,

    SPECIFICS:
      'Do not provide any reasoning or contextualization; simply return the output without any prefix or suffix.',

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

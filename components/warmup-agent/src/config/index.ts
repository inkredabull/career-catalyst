/**
 * Warmup agent configuration — sheet schema, enrichment priority, delivery mode.
 */

/** Google Sheet tab for warmup run history and A/B tracking */
export const WARMUP_SHEET_NAME = 'Warmup History';

/** HITL-only: drafts are created; nothing is sent automatically */
export const DELIVERY_MODE = 'draft' as const;

export type DeliveryMode = typeof DELIVERY_MODE;

/** Cross-region inference profile prefix (required for Claude 4.5+ on Bedrock). */
export const BEDROCK_INFERENCE_PREFIX = 'global.' as const;

/** Base foundation model IDs — must be invoked via inference profile on Bedrock. */
export const BEDROCK_MODEL_IDS = {
  haiku: 'anthropic.claude-haiku-4-5-20251001-v1:0',
  sonnet: 'anthropic.claude-sonnet-4-6',
} as const;

const INFERENCE_PROFILE_PREFIX_RE = /^(global|us|eu|au|jp|apac)\./;

/** Prefix bare model IDs with a cross-region inference profile (e.g. global.). */
export const resolveBedrockInferenceProfileId = (
  modelId: string,
  prefix = process.env.BEDROCK_INFERENCE_PREFIX ?? BEDROCK_INFERENCE_PREFIX
): string => {
  if (INFERENCE_PROFILE_PREFIX_RE.test(modelId) || modelId.startsWith('arn:aws:bedrock:')) {
    return modelId;
  }
  return `${prefix}${modelId}`;
};

/** Default Bedrock models — Haiku 4.5 (fast) + Sonnet 4.6 (judge) via inference profiles */
export const BEDROCK_MODELS = {
  planner: resolveBedrockInferenceProfileId(BEDROCK_MODEL_IDS.haiku),
  generator: resolveBedrockInferenceProfileId(BEDROCK_MODEL_IDS.haiku),
  judge: resolveBedrockInferenceProfileId(BEDROCK_MODEL_IDS.sonnet),
} as const;

/** EnrichLayer API base URL (successor to Proxycurl) */
export const ENRICHLAYER_BASE_URL = 'https://enrichlayer.com/api/v2';

/** @deprecated Use ENRICHLAYER_BASE_URL */
export const PROXYCURL_BASE_URL = ENRICHLAYER_BASE_URL;

/** Enrichment source priority (LinkedIn activity last — manual sync only) */
export const ENRICHMENT_PRIORITY = [
  'blog_rss',
  'contact_notes',
  'enrichlayer_profile',
  'twitter_handle',
  'linkedin_activity_cache',
] as const;

export type EnrichmentSource = (typeof ENRICHMENT_PRIORITY)[number];

/** Relationship tiers mapped from Google Contact labels */
export const RELATIONSHIP_TIER_WEIGHTS: Record<string, number> = {
  'Archetype/Mentor': 25,
  'Archetype/Peer': 20,
  'Archetype/Recruiter': 18,
  'Archetype/Founder': 22,
  'Archetype/Investor': 15,
  'Archetype/Ally': 20,
};

export const DEFAULT_RELATIONSHIP_TIER_WEIGHT = 10;

/** Contact scoring weights (0–100 scale components) */
export const SCORE_WEIGHTS = {
  daysSinceWarmup: 35,
  daysSinceRealContact: 30,
  enrichableUrl: 15,
  relationshipTier: 15,
  priorDraftQuality: 5,
} as const;

/** Labels/emails excluded from selection (mirrors mail-merge GAS) */
export const HARDCODED_EXCLUDED_LABELS = ['Archetype/Unhelpful'] as const;

/** Warmup History sheet column indices (0-based) */
export const COL = {
  CONTACT_ID: 0,
  NAME: 1,
  EMAIL: 2,
  LINKEDIN_URL: 3,
  RELATIONSHIP_TIER: 4,
  LAST_WARMUP: 5,
  LAST_REAL_CONTACT: 6,
  LAST_ENRICHMENT: 7,
  ENRICHMENT_SOURCE: 8,
  HOOK_TYPE: 9,
  HOOK_CONFIDENCE: 10,
  SUBJECT_VARIANT: 11,
  SUBJECT_LINE: 12,
  DRAFT_QUALITY: 13,
  DRAFT_URL: 14,
  STATUS: 15,
  OPENED: 16,
  REPLIED: 17,
  RUN_ID: 18,
  NOTES: 19,
} as const;

export const NUM_COLS = 20;

export const HEADERS = [
  'Contact ID',
  'Name',
  'Email',
  'LinkedIn URL',
  'Relationship Tier',
  'Last Warmup',
  'Last Real Contact',
  'Last Enrichment',
  'Enrichment Source',
  'Hook Type',
  'Hook Confidence',
  'Subject Variant',
  'Subject Line',
  'Draft Quality',
  'Draft URL',
  'Status',
  'Opened',
  'Replied',
  'Run ID',
  'Notes',
] as const;

export const WARMUP_STATUS = {
  PLANNED: 'PLANNED',
  DRAFT_CREATED: 'DRAFT_CREATED',
  SKIPPED: 'SKIPPED',
  FAILED: 'FAILED',
} as const;

export type WarmupStatus = (typeof WARMUP_STATUS)[keyof typeof WARMUP_STATUS];

/** Phase 1 agent tuning */
export const AGENT_DEFAULTS = {
  minHookConfidence: 0.6,
  minDraftQuality: 70,
  maxCorrectIterations: 3,
} as const;

/** Static template token defaults (dynamic tokens filled by Bedrock) */
export const STATIC_TEMPLATE_VALUES = {
  Reciprocate: 'Either way,',
  Valediction: 'Best,',
} as const;

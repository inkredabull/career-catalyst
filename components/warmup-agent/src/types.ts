import type { EnrichmentSource, WarmupStatus } from './config';

export interface ScorableContact {
  /** Stable ID — Google People resourceName or email hash */
  contactId: string;
  displayName: string;
  email: string;
  linkedInUrl?: string;
  blogUrl?: string;
  twitterHandle?: string;
  relationshipTier?: string;
  labels: string[];
  notes?: string;
  lastWarmupDate?: Date;
  lastRealContactDate?: Date;
  priorDraftQuality?: number;
}

export interface ContactScoreBreakdown {
  daysSinceWarmup: number;
  daysSinceRealContact: number;
  enrichableUrl: number;
  relationshipTier: number;
  priorDraftQuality: number;
}

export interface ContactScore {
  contactId: string;
  displayName: string;
  totalScore: number;
  breakdown: ContactScoreBreakdown;
  enrichmentSources: EnrichmentSource[];
  rationale: string;
}

export interface WarmupHistoryRow {
  contactId: string;
  name: string;
  email: string;
  linkedInUrl?: string;
  relationshipTier?: string;
  lastWarmup?: string;
  lastRealContact?: string;
  lastEnrichment?: string;
  enrichmentSource?: EnrichmentSource;
  hookType?: string;
  hookConfidence?: number;
  subjectVariant?: string;
  subjectLine?: string;
  draftQuality?: number;
  draftUrl?: string;
  status?: WarmupStatus;
  opened?: boolean;
  replied?: boolean;
  runId?: string;
  notes?: string;
}

export interface EnrichLayerProfile {
  fullName?: string;
  full_name?: string;
  headline?: string;
  occupation?: string;
  summary?: string;
  city?: string;
  country?: string;
  experiences?: Array<{
    title?: string;
    company?: string;
    starts_at?: { year?: number; month?: number } | null;
    ends_at?: { year?: number; month?: number } | null;
  }>;
}

export interface EnrichmentPlan {
  contactId: string;
  sources: EnrichmentSource[];
  primarySource: EnrichmentSource;
  linkedInUrl?: string;
  blogUrl?: string;
  notesAvailable: boolean;
}

export interface RssItem {
  title: string;
  link?: string;
  pubDate?: string;
  summary?: string;
}

export interface EnrichmentSignal {
  source: EnrichmentSource;
  summary: string;
  evidence?: string;
  url?: string;
  date?: string;
}

export interface EnrichmentResult {
  contactId: string;
  signals: EnrichmentSignal[];
  primarySource?: EnrichmentSource;
  failedSources: EnrichmentSource[];
}

export type HookType =
  | 'blog_post'
  | 'role_change'
  | 'headline'
  | 'notes_reference'
  | 'check_in';

export interface HookInfo {
  hookType: HookType;
  hookText: string;
  confidence: number;
  evidence: string;
  source: EnrichmentSource | 'generated';
}

export interface GeneratedTokens {
  Zeitgeisty: string;
  Personalization: string;
  hook: HookInfo;
  rawResponse?: string;
}

export interface RenderedDraft {
  subject: string;
  bodyText: string;
  bodyHtml: string;
  tokens: Record<string, string>;
}

export interface JudgeResult {
  score: number;
  passed: boolean;
  feedback: string;
  concerns: string[];
}

export interface ContactRunResult {
  contactId: string;
  displayName: string;
  email: string;
  status: WarmupStatus;
  enrichment?: EnrichmentResult;
  hook?: HookInfo;
  draft?: RenderedDraft;
  judge?: JudgeResult;
  draftUrl?: string;
  draftId?: string;
  iterations: number;
  error?: string;
  costUsd: number;
}

export interface RunResult {
  runId: string;
  createdAt: string;
  contacts: ContactRunResult[];
  totalCostUsd: number;
  digestSent: boolean;
}

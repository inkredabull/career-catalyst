import type { WarmupHistoryRow } from '../types';

/** Subject line variants for A/B testing */
export interface SubjectVariant {
  id: string;
  label: string;
  /** Static subject or template with {{First}} token */
  template: string;
  description: string;
}

export const SUBJECT_VARIANTS: SubjectVariant[] = [
  {
    id: 'control',
    label: 'Control',
    template: 'Catching up + a quick ask',
    description: 'Current default — proven baseline',
  },
  {
    id: 'personal_first',
    label: 'Personal First',
    template: '{{First}} — quick catch-up + a favor',
    description: 'Name-first, warmer tone',
  },
  {
    id: 'direct_ask',
    label: 'Direct Ask',
    template: 'Fractional VP Eng intro ask (+ catch up)',
    description: 'Lead with the ask for clarity',
  },
  {
    id: 'zeitgeist_led',
    label: 'Zeitgeist Led',
    template: '{{ZeitgeistSnippet}} — and a quick ask',
    description: 'Timely hook in subject when enrichment provides one',
  },
  {
    id: 'relationship',
    label: 'Relationship',
    template: 'Been too long, {{First}}',
    description: 'Relationship-first, low-pressure',
  },
];

export interface SubjectAssignment {
  variantId: string;
  subjectLine: string;
  template: string;
}

export interface SubjectAbConfig {
  /** Minimum sends before favoring higher-performing variants (future) */
  minSamplesPerVariant: number;
  /** Exploration rate for epsilon-greedy (0 = pure round-robin) */
  explorationRate: number;
}

export const DEFAULT_SUBJECT_AB_CONFIG: SubjectAbConfig = {
  minSamplesPerVariant: 10,
  explorationRate: 0,
};

export const renderSubjectTemplate = (
  template: string,
  tokens: Record<string, string>
): string => {
  let result = template;
  for (const [key, value] of Object.entries(tokens)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result.replace(/\{\{[^{}]+\}\}/g, '').replace(/\s+/g, ' ').trim();
};

/** Round-robin assignment for Phase 0 — tracks usage counts per variant */
export const assignSubjectVariant = (
  variantId: string | undefined,
  tokens: Record<string, string> = {}
): SubjectAssignment => {
  const variant =
    SUBJECT_VARIANTS.find(v => v.id === variantId) ??
    SUBJECT_VARIANTS[0]!;

  return {
    variantId: variant.id,
    subjectLine: renderSubjectTemplate(variant.template, tokens),
    template: variant.template,
  };
};

export const pickSubjectVariantRoundRobin = (
  history: WarmupHistoryRow[],
  tokens: Record<string, string> = {}
): SubjectAssignment => {
  const usageCounts = new Map<string, number>();
  for (const variant of SUBJECT_VARIANTS) {
    usageCounts.set(variant.id, 0);
  }

  for (const row of history) {
    if (!row.subjectVariant) continue;
    usageCounts.set(row.subjectVariant, (usageCounts.get(row.subjectVariant) ?? 0) + 1);
  }

  const leastUsed = SUBJECT_VARIANTS.reduce((best, current) => {
    const bestCount = usageCounts.get(best.id) ?? 0;
    const currentCount = usageCounts.get(current.id) ?? 0;
    return currentCount < bestCount ? current : best;
  });

  return assignSubjectVariant(leastUsed.id, tokens);
};

export interface VariantPerformance {
  variantId: string;
  sends: number;
  opens: number;
  replies: number;
  openRate: number;
  replyRate: number;
}

/** Aggregate A/B metrics from warmup history (for future epsilon-greedy) */
export const aggregateVariantPerformance = (
  history: WarmupHistoryRow[]
): VariantPerformance[] => {
  const stats = new Map<string, { sends: number; opens: number; replies: number }>();

  for (const variant of SUBJECT_VARIANTS) {
    stats.set(variant.id, { sends: 0, opens: 0, replies: 0 });
  }

  for (const row of history) {
    if (!row.subjectVariant || row.status !== 'DRAFT_CREATED') continue;
    const bucket = stats.get(row.subjectVariant) ?? { sends: 0, opens: 0, replies: 0 };
    bucket.sends += 1;
    if (row.opened) bucket.opens += 1;
    if (row.replied) bucket.replies += 1;
    stats.set(row.subjectVariant, bucket);
  }

  return SUBJECT_VARIANTS.map(variant => {
    const bucket = stats.get(variant.id) ?? { sends: 0, opens: 0, replies: 0 };
    return {
      variantId: variant.id,
      sends: bucket.sends,
      opens: bucket.opens,
      replies: bucket.replies,
      openRate: bucket.sends > 0 ? bucket.opens / bucket.sends : 0,
      replyRate: bucket.sends > 0 ? bucket.replies / bucket.sends : 0,
    };
  });
};

/** Epsilon-greedy variant picker — use once minSamplesPerVariant is met */
export const pickSubjectVariantEpsilonGreedy = (
  history: WarmupHistoryRow[],
  tokens: Record<string, string> = {},
  config: SubjectAbConfig = DEFAULT_SUBJECT_AB_CONFIG,
  random = Math.random
): SubjectAssignment => {
  const performance = aggregateVariantPerformance(history);
  const minSamples = Math.min(...performance.map(p => p.sends));

  if (minSamples < config.minSamplesPerVariant || random() < config.explorationRate) {
    return pickSubjectVariantRoundRobin(history, tokens);
  }

  const best = performance.reduce((a, b) => (b.replyRate > a.replyRate ? b : a));
  return assignSubjectVariant(best.variantId, tokens);
};

import {
  ENRICHMENT_PRIORITY,
  DEFAULT_RELATIONSHIP_TIER_WEIGHT,
  RELATIONSHIP_TIER_WEIGHTS,
  SCORE_WEIGHTS,
  type EnrichmentSource,
} from '../config';
import type { ContactScore, ContactScoreBreakdown, ScorableContact } from '../types';

const MS_PER_DAY = 86_400_000;

export const daysSince = (date: Date | undefined, now = new Date()): number => {
  if (!date) return 365;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / MS_PER_DAY));
};

export const hasEnrichableUrl = (contact: ScorableContact): boolean =>
  Boolean(contact.blogUrl || contact.linkedInUrl || contact.twitterHandle);

export const resolveRelationshipTierWeight = (labels: string[], explicitTier?: string): number => {
  if (explicitTier && RELATIONSHIP_TIER_WEIGHTS[explicitTier] != null) {
    return RELATIONSHIP_TIER_WEIGHTS[explicitTier];
  }

  for (const label of labels) {
    const weight = RELATIONSHIP_TIER_WEIGHTS[label];
    if (weight != null) return weight;
  }

  return DEFAULT_RELATIONSHIP_TIER_WEIGHT;
};

/** Map available contact data to enrichment sources in priority order */
export const resolveEnrichmentSources = (contact: ScorableContact): EnrichmentSource[] => {
  const available = new Set<EnrichmentSource>();

  if (contact.blogUrl) available.add('blog_rss');
  if (contact.notes?.trim()) available.add('contact_notes');
  if (contact.linkedInUrl) available.add('enrichlayer_profile');
  if (contact.twitterHandle) available.add('twitter_handle');
  // linkedin_activity_cache requires manual Chrome extension sync — never auto-selected first

  return ENRICHMENT_PRIORITY.filter(source => available.has(source));
};

export const scoreDaysComponent = (days: number, maxDays = 180): number => {
  const capped = Math.min(days, maxDays);
  return Math.round((capped / maxDays) * 100);
};

export const scorePriorQuality = (quality: number | undefined): number => {
  if (quality == null) return 50;
  return Math.max(0, Math.min(100, quality));
};

export const scoreContact = (contact: ScorableContact, now = new Date()): ContactScore => {
  const daysSinceWarmup = daysSince(contact.lastWarmupDate, now);
  const daysSinceRealContact = daysSince(contact.lastRealContactDate, now);

  const breakdown: ContactScoreBreakdown = {
    daysSinceWarmup: scoreDaysComponent(daysSinceWarmup),
    daysSinceRealContact: scoreDaysComponent(daysSinceRealContact),
    enrichableUrl: hasEnrichableUrl(contact) ? 100 : 0,
    relationshipTier: resolveRelationshipTierWeight(contact.labels, contact.relationshipTier),
    priorDraftQuality: scorePriorQuality(contact.priorDraftQuality),
  };

  const totalScore =
    (breakdown.daysSinceWarmup * SCORE_WEIGHTS.daysSinceWarmup +
      breakdown.daysSinceRealContact * SCORE_WEIGHTS.daysSinceRealContact +
      breakdown.enrichableUrl * SCORE_WEIGHTS.enrichableUrl +
      breakdown.relationshipTier * SCORE_WEIGHTS.relationshipTier +
      breakdown.priorDraftQuality * SCORE_WEIGHTS.priorDraftQuality) /
    100;

  const enrichmentSources = resolveEnrichmentSources(contact);

  const rationale = [
    `${daysSinceWarmup}d since last warmup`,
    `${daysSinceRealContact}d since last contact`,
    enrichmentSources.length > 0
      ? `enrichment via ${enrichmentSources.join(' → ')}`
      : 'no enrichment sources',
    contact.relationshipTier ?? contact.labels.find((l: string) => l.startsWith('Archetype/')) ?? 'untiered',
  ].join('; ');

  return {
    contactId: contact.contactId,
    displayName: contact.displayName,
    totalScore: Math.round(totalScore * 10) / 10,
    breakdown,
    enrichmentSources,
    rationale,
  };
};

export const rankContacts = (contacts: ScorableContact[], count: number, now = new Date()): ContactScore[] =>
  contacts
    .map(contact => scoreContact(contact, now))
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, count);

export const isExcludedContact = (
  contact: ScorableContact,
  excludedLabels: readonly string[],
  excludedEmails: Set<string>
): boolean => {
  if (excludedEmails.has(contact.email.toLowerCase())) return true;
  return contact.labels.some((label: string) => excludedLabels.includes(label));
};

import { ENRICHMENT_PRIORITY, type EnrichmentSource } from '../config';
import type { EnrichmentPlan, ScorableContact } from '../types';
import { resolveEnrichmentSources } from '../scoring/contact-scorer';

export const planEnrichment = (contact: ScorableContact): EnrichmentPlan => {
  const sources = resolveEnrichmentSources(contact);
  const primarySource = sources[0] ?? 'contact_notes';

  return {
    contactId: contact.contactId,
    sources: sources.length > 0 ? sources : (['contact_notes'] as EnrichmentSource[]),
    primarySource,
    linkedInUrl: contact.linkedInUrl,
    blogUrl: contact.blogUrl,
    notesAvailable: Boolean(contact.notes?.trim()),
  };
};

/** Fallback chain when a source fails during Act phase */
export const nextEnrichmentSource = (
  plan: EnrichmentPlan,
  failedSource: EnrichmentSource
): EnrichmentSource | null => {
  const idx = plan.sources.indexOf(failedSource);
  if (idx < 0) return null;
  return plan.sources[idx + 1] ?? null;
};

export const describeEnrichmentPlan = (plan: EnrichmentPlan): string => {
  const ordered = ENRICHMENT_PRIORITY.filter(s => plan.sources.includes(s));
  return ordered.length > 0
    ? ordered.join(' → ')
    : 'contact_notes (fallback)';
};

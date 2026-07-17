import { randomUUID } from 'crypto';
import { HARDCODED_EXCLUDED_LABELS } from '../config';
import { mergeHistoryIntoContacts } from '../contacts/loader';
import { buildContactHistoryIndex } from '../data/sheet-service';
import { planEnrichment, describeEnrichmentPlan } from '../enrichment/planner';
import { isExcludedContact, rankContacts } from '../scoring/contact-scorer';
import { pickSubjectVariantRoundRobin } from '../subjects/subject-ab';
import type { ContactScore, ScorableContact, WarmupHistoryRow } from '../types';

export interface PlannedContact {
  contact: ScorableContact;
  score: ContactScore;
  enrichmentPlanDescription: string;
  subjectVariantId: string;
  subjectLine: string;
}

export interface RunSpec {
  runId: string;
  createdAt: string;
  contactCount: number;
  excludedCount: number;
  totalPoolSize: number;
  contacts: PlannedContact[];
}

export interface PlanRunOptions {
  contacts: ScorableContact[];
  history: WarmupHistoryRow[];
  count?: number;
  excludedLabelPrefixes?: string[];
  excludedEmails?: string[];
  now?: Date;
}

const buildExcludedLabels = (prefixes: string[] = []): string[] => {
  const labels: string[] = [...HARDCODED_EXCLUDED_LABELS];
  for (const prefix of prefixes) {
    labels.push(prefix);
  }
  return labels;
};

const labelMatchesPrefix = (label: string, prefixes: string[]): boolean =>
  prefixes.some(prefix => label.startsWith(prefix));

export const filterContacts = (
  contacts: ScorableContact[],
  excludedLabels: string[],
  excludedEmails: Set<string>,
  excludedLabelPrefixes: string[] = []
): ScorableContact[] =>
  contacts.filter(contact => {
    if (isExcludedContact(contact, excludedLabels, excludedEmails)) return false;
    if (excludedLabelPrefixes.length === 0) return true;
    return !contact.labels.some(label => labelMatchesPrefix(label, excludedLabelPrefixes));
  });

export const planRun = (options: PlanRunOptions): RunSpec => {
  const {
    contacts,
    history,
    count = 5,
    excludedLabelPrefixes = [],
    excludedEmails = [],
    now = new Date(),
  } = options;

  const excludedLabelSet = buildExcludedLabels();
  const excludedEmailSet = new Set(excludedEmails.map(e => e.toLowerCase()));

  const historyIndex = buildContactHistoryIndex(history);
  const enrichedContacts = mergeHistoryIntoContacts(contacts, historyIndex);

  const eligible = filterContacts(
    enrichedContacts,
    excludedLabelSet,
    excludedEmailSet,
    excludedLabelPrefixes
  );

  const ranked = rankContacts(eligible, count, now);

  const planned: PlannedContact[] = ranked.map(score => {
    const contact = eligible.find(c => c.contactId === score.contactId)!;
    const enrichmentPlan = planEnrichment(contact);
    const firstName = contact.displayName.trim().split(/\s+/)[0] ?? '';
    const subject = pickSubjectVariantRoundRobin(history, { First: firstName });

    return {
      contact,
      score,
      enrichmentPlanDescription: describeEnrichmentPlan(enrichmentPlan),
      subjectVariantId: subject.variantId,
      subjectLine: subject.subjectLine,
    };
  });

  return {
    runId: randomUUID().slice(0, 8),
    createdAt: now.toISOString(),
    contactCount: planned.length,
    excludedCount: contacts.length - eligible.length,
    totalPoolSize: contacts.length,
    contacts: planned,
  };
};

export const runSpecToHistoryRows = (spec: RunSpec): WarmupHistoryRow[] =>
  spec.contacts.map(item => ({
    contactId: item.contact.contactId,
    name: item.contact.displayName,
    email: item.contact.email,
    linkedInUrl: item.contact.linkedInUrl,
    relationshipTier: item.contact.relationshipTier,
    subjectVariant: item.subjectVariantId,
    subjectLine: item.subjectLine,
    status: 'PLANNED',
    runId: spec.runId,
    notes: item.score.rationale,
  }));

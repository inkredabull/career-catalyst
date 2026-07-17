import type { WarmupHistoryRow, ScorableContact } from '../types';

export interface ContactInput {
  contactId: string;
  displayName: string;
  email: string;
  linkedInUrl?: string;
  blogUrl?: string;
  twitterHandle?: string;
  relationshipTier?: string;
  labels?: string[];
  notes?: string;
  lastRealContactDate?: string;
}

export const parseContactInput = (raw: ContactInput): ScorableContact => ({
  contactId: raw.contactId,
  displayName: raw.displayName,
  email: raw.email,
  linkedInUrl: raw.linkedInUrl,
  blogUrl: raw.blogUrl,
  twitterHandle: raw.twitterHandle,
  relationshipTier: raw.relationshipTier,
  labels: raw.labels ?? [],
  notes: raw.notes,
  lastRealContactDate: raw.lastRealContactDate ? new Date(raw.lastRealContactDate) : undefined,
});

export const mergeHistoryIntoContacts = (
  contacts: ScorableContact[],
  historyIndex: Map<string, WarmupHistoryRow>
): ScorableContact[] =>
  contacts.map(contact => {
    const history = historyIndex.get(contact.contactId);
    if (!history) return contact;

    return {
      ...contact,
      linkedInUrl: contact.linkedInUrl ?? history.linkedInUrl,
      relationshipTier: contact.relationshipTier ?? history.relationshipTier,
      lastWarmupDate: history.lastWarmup ? new Date(history.lastWarmup) : contact.lastWarmupDate,
      lastRealContactDate: history.lastRealContact
        ? new Date(history.lastRealContact)
        : contact.lastRealContactDate,
      priorDraftQuality: history.draftQuality ?? contact.priorDraftQuality,
    };
  });

export const loadContactsFromJson = (json: string): ScorableContact[] => {
  const parsed = JSON.parse(json) as ContactInput[];
  if (!Array.isArray(parsed)) {
    throw new Error('Contacts JSON must be an array');
  }
  return parsed.map(parseContactInput);
};

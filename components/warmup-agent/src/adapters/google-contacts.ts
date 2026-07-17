import { google, people_v1 } from 'googleapis';
import { HARDCODED_EXCLUDED_LABELS } from '../config';
import type { ScorableContact } from '../types';

const CONTACTS_SCOPE_HINT =
  'Re-run: npm run setup-gmail — your token needs contacts.readonly (Phase 2). ' +
  'Enable People API in GCP if not already: https://console.cloud.google.com/apis/library/people.googleapis.com';

export const isInsufficientScopeError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: number; message?: string; response?: { data?: { error?: { message?: string } } } };
  if (err.code === 403) return true;
  const msg = err.message ?? err.response?.data?.error?.message ?? '';
  return /insufficient authentication scopes/i.test(msg);
};

export const wrapGoogleContactsError = (error: unknown): Error => {
  if (isInsufficientScopeError(error)) {
    return new Error(
      `Google Contacts access denied — insufficient OAuth scopes.\n${CONTACTS_SCOPE_HINT}`
    );
  }
  if (error instanceof Error) return error;
  return new Error(String(error));
};

export interface ContactGroupInfo {
  id: string;
  name: string;
  groupType: string;
}

export interface GoogleContactsFetchOptions {
  excludedLabelPrefixes?: string[];
  excludedEmails?: string[];
}

const LINKEDIN_RE = /linkedin\.com/i;
const TWITTER_RE = /twitter\.com|x\.com/i;
const BLOG_HINTS = /blog|medium\.com|substack\.com|dev\.to|\.dev\/|wordpress/i;

export const extractLinkedInUrl = (
  urls: people_v1.Schema$Url[] | undefined
): string | undefined =>
  urls?.find(
    u =>
      u.type?.toLowerCase() === 'linkedin' ||
      (u.value && LINKEDIN_RE.test(u.value))
  )?.value ?? undefined;

export const extractBlogUrl = (
  urls: people_v1.Schema$Url[] | undefined
): string | undefined =>
  urls?.find(u => u.value && BLOG_HINTS.test(u.value))?.value ?? undefined;

export const extractTwitterHandle = (
  urls: people_v1.Schema$Url[] | undefined
): string | undefined => {
  const twitterUrl = urls?.find(u => u.value && TWITTER_RE.test(u.value))?.value;
  if (!twitterUrl) return undefined;
  const match = twitterUrl.match(/(?:twitter\.com|x\.com)\/([^/?#]+)/i);
  return match?.[1] ? `@${match[1]}` : twitterUrl;
};

export const resolvePersonLabels = (
  person: people_v1.Schema$Person,
  groups: Map<string, ContactGroupInfo>,
  userGroupIds: Set<string>
): string[] => {
  const labels: string[] = [];
  for (const membership of person.memberships ?? []) {
    const groupId = membership.contactGroupMembership?.contactGroupId;
    if (!groupId || !userGroupIds.has(groupId)) continue;
    const group = groups.get(groupId);
    if (group?.name) labels.push(group.name);
  }
  return labels;
};

export const resolveRelationshipTier = (labels: string[]): string | undefined =>
  labels.find(l => l.startsWith('Archetype/'));

export const resolvePrimaryEmail = (
  emails: people_v1.Schema$EmailAddress[] | undefined
): string => {
  if (!emails?.length) return '';
  const home = emails.find(e => e.type === 'home');
  return home?.value ?? emails[0]?.value ?? '';
};

export const resolveNotes = (person: people_v1.Schema$Person): string | undefined => {
  const bio = person.biographies?.[0]?.value?.trim();
  return bio || undefined;
};

export const mapPersonToScorable = (
  person: people_v1.Schema$Person,
  groups: Map<string, ContactGroupInfo>,
  userGroupIds: Set<string>
): ScorableContact | null => {
  const displayName = person.names?.[0]?.displayName?.trim();
  if (!displayName || !person.resourceName) return null;

  const email = resolvePrimaryEmail(person.emailAddresses);
  const labels = resolvePersonLabels(person, groups, userGroupIds);

  return {
    contactId: person.resourceName,
    displayName,
    email,
    linkedInUrl: extractLinkedInUrl(person.urls),
    blogUrl: extractBlogUrl(person.urls),
    twitterHandle: extractTwitterHandle(person.urls),
    relationshipTier: resolveRelationshipTier(labels),
    labels,
    notes: resolveNotes(person),
  };
};

export const shouldIncludeContact = (
  person: people_v1.Schema$Person,
  groups: Map<string, ContactGroupInfo>,
  userGroupIds: Set<string>,
  excludedGroupIds: Set<string>,
  excludedEmails: Set<string>
): boolean => {
  if (!person.names?.[0]?.displayName) return true;

  if (
    person.emailAddresses?.some(e =>
      excludedEmails.has((e.value ?? '').toLowerCase())
    )
  ) {
    return false;
  }

  const memberships = person.memberships ?? [];
  const userMemberships = memberships.filter(
    m =>
      m.contactGroupMembership?.contactGroupId != null &&
      userGroupIds.has(m.contactGroupMembership.contactGroupId)
  );

  if (userMemberships.length === 0) return true;

  return !userMemberships.some(m =>
    excludedGroupIds.has(m.contactGroupMembership!.contactGroupId!)
  );
};

export const buildExcludedGroupIds = (
  groups: Map<string, ContactGroupInfo>,
  excludedLabelPrefixes: string[] = []
): Set<string> => {
  const excluded = new Set<string>();
  for (const group of groups.values()) {
    if ((HARDCODED_EXCLUDED_LABELS as readonly string[]).includes(group.name)) {
      excluded.add(group.id);
    }
    if (excludedLabelPrefixes.some(prefix => group.name.startsWith(prefix))) {
      excluded.add(group.id);
    }
  }
  return excluded;
};

export class GoogleContactsService {
  private people: people_v1.People;

  constructor() {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob'
    );

    if (process.env.GOOGLE_REFRESH_TOKEN) {
      oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    }

    this.people = google.people({ version: 'v1', auth: oauth2Client });
  }

  async listContactGroups(): Promise<Map<string, ContactGroupInfo>> {
    const groups = new Map<string, ContactGroupInfo>();
    let pageToken: string | undefined;

    try {
      do {
        const response = await this.people.contactGroups.list({
          pageSize: 200,
          pageToken,
        });

        for (const g of response.data.contactGroups ?? []) {
          const id = (g.resourceName ?? '').replace('contactGroups/', '');
          if (!id) continue;
          groups.set(id, {
            id,
            name: g.name ?? '',
            groupType: g.groupType ?? '',
          });
        }

        pageToken = response.data.nextPageToken ?? undefined;
      } while (pageToken);
    } catch (error) {
      throw wrapGoogleContactsError(error);
    }

    return groups;
  }

  async fetchConnections(): Promise<people_v1.Schema$Person[]> {
    if (!process.env.GOOGLE_REFRESH_TOKEN) {
      throw new Error(
        'GOOGLE_REFRESH_TOKEN not set. Run: npm run setup-gmail (requires contacts.readonly scope)'
      );
    }

    const connections: people_v1.Schema$Person[] = [];
    let pageToken: string | undefined;

    try {
      do {
        const response = await this.people.people.connections.list({
          resourceName: 'people/me',
          pageSize: 1000,
          personFields:
            'names,emailAddresses,urls,memberships,biographies,metadata',
          pageToken,
        });

        if (response.data.connections?.length) {
          connections.push(...response.data.connections);
        }

        pageToken = response.data.nextPageToken ?? undefined;
      } while (pageToken);
    } catch (error) {
      throw wrapGoogleContactsError(error);
    }

    return connections;
  }

  async fetchScorableContacts(
    options: GoogleContactsFetchOptions = {}
  ): Promise<ScorableContact[]> {
    const groups = await this.listContactGroups();
    const userGroupIds = new Set(
      [...groups.values()]
        .filter(g => g.groupType === 'USER_CONTACT_GROUP')
        .map(g => g.id)
    );

    const excludedGroupIds = buildExcludedGroupIds(
      groups,
      options.excludedLabelPrefixes
    );
    const excludedEmails = new Set(
      (options.excludedEmails ?? []).map(e => e.toLowerCase())
    );

    const rawEnv = process.env.WARMUP_EXCLUDE_EMAILS ?? '';
    for (const email of rawEnv.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)) {
      excludedEmails.add(email);
    }

    const prefixEnv = process.env.WARMUP_EXCLUDE_LABEL_PREFIXES ?? '';
    const prefixFromEnv = prefixEnv.split(',').map(p => p.trim()).filter(Boolean);
    for (const prefix of prefixFromEnv) {
      for (const group of groups.values()) {
        if (group.name.startsWith(prefix)) excludedGroupIds.add(group.id);
      }
    }

    const connections = await this.fetchConnections();

    return connections
      .filter(p =>
        shouldIncludeContact(p, groups, userGroupIds, excludedGroupIds, excludedEmails)
      )
      .map(p => mapPersonToScorable(p, groups, userGroupIds))
      .filter((c): c is ScorableContact => c != null);
  }
}

export const contactsToJson = (contacts: ScorableContact[]): string =>
  JSON.stringify(
    contacts.map(c => ({
      contactId: c.contactId,
      displayName: c.displayName,
      email: c.email,
      linkedInUrl: c.linkedInUrl,
      blogUrl: c.blogUrl,
      twitterHandle: c.twitterHandle,
      relationshipTier: c.relationshipTier,
      labels: c.labels,
      notes: c.notes,
    })),
    null,
    2
  );

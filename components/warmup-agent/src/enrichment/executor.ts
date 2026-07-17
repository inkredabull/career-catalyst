import type { EnrichmentSource } from '../config';
import {
  EnrichLayerClient,
  extractHeadlineHook,
  extractRoleChangeHook,
  resolveEnrichLayerToken,
} from './enrichlayer-client';
import { planEnrichment, nextEnrichmentSource } from './planner';
import { fetchRssItems, summarizeLatestPost } from './rss';
import type {
  EnrichmentResult,
  EnrichmentSignal,
  ScorableContact,
} from '../types';

export interface EnrichmentExecutorOptions {
  enrichLayerToken?: string;
  /** @deprecated Use enrichLayerToken — alias for PROXYCURL_API_KEY */
  proxycurlApiKey?: string;
  fetchFn?: typeof fetch;
}

export const enrichFromNotes = (contact: ScorableContact): EnrichmentSignal | null => {
  const notes = contact.notes?.trim();
  if (!notes) return null;

  return {
    source: 'contact_notes',
    summary: notes.slice(0, 500),
    evidence: notes,
  };
};

export const enrichFromEnrichLayer = async (
  linkedInUrl: string,
  client: EnrichLayerClient
): Promise<EnrichmentSignal[]> => {
  const profile = await client.getLinkedInProfile(linkedInUrl);
  const signals: EnrichmentSignal[] = [];

  const roleHook = extractRoleChangeHook(profile);
  if (roleHook) {
    signals.push({
      source: 'enrichlayer_profile',
      summary: roleHook,
      evidence: roleHook,
    });
  }

  const headline = extractHeadlineHook(profile);
  if (headline && headline !== roleHook) {
    signals.push({
      source: 'enrichlayer_profile',
      summary: headline,
      evidence: headline,
    });
  }

  if (profile.summary?.trim()) {
    signals.push({
      source: 'enrichlayer_profile',
      summary: profile.summary.trim().slice(0, 300),
      evidence: profile.summary.trim(),
    });
  }

  if (signals.length === 0) {
    throw new Error('EnrichLayer returned no usable profile signals');
  }

  return signals;
};

export const enrichFromRss = async (
  blogUrl: string,
  fetchFn?: typeof fetch
): Promise<EnrichmentSignal> => {
  const items = await fetchRssItems(blogUrl, 5, fetchFn);
  const latest = items[0]!;

  return {
    source: 'blog_rss',
    summary: summarizeLatestPost(items),
    evidence: latest.title,
    url: latest.link,
    date: latest.pubDate,
  };
};

export const enrichFromTwitterHandle = (handle: string): EnrichmentSignal => ({
  source: 'twitter_handle',
  summary: `Twitter/X handle on file: ${handle}`,
  evidence: handle,
});

const resolveToken = (options: EnrichmentExecutorOptions): string | undefined =>
  options.enrichLayerToken ??
  options.proxycurlApiKey ??
  resolveEnrichLayerToken();

const runSource = async (
  source: EnrichmentSource,
  contact: ScorableContact,
  options: EnrichmentExecutorOptions
): Promise<EnrichmentSignal[]> => {
  switch (source) {
    case 'blog_rss':
      if (!contact.blogUrl) throw new Error('No blog URL');
      return [await enrichFromRss(contact.blogUrl, options.fetchFn)];
    case 'contact_notes': {
      const signal = enrichFromNotes(contact);
      if (!signal) throw new Error('No contact notes');
      return [signal];
    }
    case 'enrichlayer_profile': {
      if (!contact.linkedInUrl) throw new Error('No LinkedIn URL');
      const token = resolveToken(options);
      if (!token) throw new Error('ENRICHLAYER_API_TOKEN not set');
      const client = new EnrichLayerClient({
        apiToken: token,
        fetchFn: options.fetchFn,
      });
      return enrichFromEnrichLayer(contact.linkedInUrl, client);
    }
    case 'twitter_handle':
      if (!contact.twitterHandle) throw new Error('No Twitter handle');
      return [enrichFromTwitterHandle(contact.twitterHandle)];
    case 'linkedin_activity_cache':
      throw new Error('LinkedIn activity cache not populated');
    default:
      throw new Error(`Unknown enrichment source: ${source}`);
  }
};

/** Execute enrichment plan with fallback chain */
export const executeEnrichment = async (
  contact: ScorableContact,
  options: EnrichmentExecutorOptions = {}
): Promise<EnrichmentResult> => {
  const plan = planEnrichment(contact);
  const signals: EnrichmentSignal[] = [];
  const failedSources: EnrichmentSource[] = [];

  for (const source of plan.sources) {
    try {
      const batch = await runSource(source, contact, options);
      signals.push(...batch);
      break;
    } catch {
      failedSources.push(source);
      const next = nextEnrichmentSource(plan, source);
      if (!next) continue;
    }
  }

  if (signals.length === 0 && contact.notes?.trim()) {
    const fallback = enrichFromNotes(contact);
    if (fallback) signals.push(fallback);
  }

  // LinkedIn URL only — EnrichLayer unavailable or failed
  if (signals.length === 0 && contact.linkedInUrl) {
    signals.push({
      source: 'contact_notes',
      summary: 'Checking in after a while',
      evidence: contact.linkedInUrl,
    });
  }

  return {
    contactId: contact.contactId,
    signals,
    primarySource: signals[0]?.source,
    failedSources,
  };
};

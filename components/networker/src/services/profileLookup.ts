/**
 * EnrichLayer profile lookup service.
 * Ported from meetup-networker/profileLookup.ts — updated to use DiscoveredProfile.
 */

import axios from 'axios';
import OpenAI from 'openai';
import { DiscoveredProfile, ContactPriorityTier } from '../types.js';
import { classifyTier } from '../config.js';
import { getCachedLookup, saveLookupToCache } from '../cache.js';
import { ParsedName } from '../nameParser.js';

// ---------------------------------------------------------------------------
// EnrichLayer response shapes
// ---------------------------------------------------------------------------

interface ELCreditBalance { credit_balance: number; }

interface ELSearchResult {
  results: Array<{ linkedin_profile_url?: string }>;
}

interface ELExperience {
  title: string;
  company: string;
  location?: string;
  starts_at: { day?: number; month?: number; year?: number } | null;
  ends_at: { day?: number; month?: number; year?: number } | null;
}

interface ELProfile {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  occupation?: string;
  location_str?: string;
  summary?: string;
  experiences?: ELExperience[];
}

// ---------------------------------------------------------------------------
// Credit balance
// ---------------------------------------------------------------------------

export async function getCreditBalance(): Promise<number | null> {
  const token = process.env.ENRICHLAYER_API_TOKEN;
  if (!token) { console.error('ENRICHLAYER_API_TOKEN not set'); return null; }

  try {
    const { data } = await axios.get<ELCreditBalance>(
      'https://enrichlayer.com/api/v2/credit-balance',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return data.credit_balance;
  } catch (e) {
    console.error('Failed to fetch credit balance:', axios.isAxiosError(e) ? e.message : e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Summary condensation (OpenAI, optional)
// ---------------------------------------------------------------------------

async function condenseSummary(summary: string): Promise<string | undefined> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key === 'your_openai_key_here') return undefined;

  try {
    const openai = new OpenAI({ apiKey: key });
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            "You condense LinkedIn profile summaries into exactly 4 words or less that capture the person's professional identity. Return only the condensed phrase.",
        },
        { role: 'user', content: `Condense to 4 words or less: ${summary}` },
      ],
      temperature: 0.7,
      max_tokens: 20,
    });
    return resp.choices[0]?.message?.content?.trim();
  } catch (e) {
    console.error('OpenAI condensation failed:', e instanceof Error ? e.message : e);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Single profile lookup
// ---------------------------------------------------------------------------

export async function lookupLinkedInProfile(
  firstName: string,
  lastName: string,
  eventName: string
): Promise<DiscoveredProfile> {
  const cached = getCachedLookup(firstName, lastName, eventName);
  if (cached) { console.log(`  [CACHED] ${firstName} ${lastName}`); return cached; }

  const token = process.env.ENRICHLAYER_API_TOKEN;
  if (!token) {
    return { name: `${firstName} ${lastName}`, error: 'ENRICHLAYER_API_TOKEN not set' };
  }

  const city = `"${process.env.SEARCH_CITY ?? 'San Francisco'}"`;

  try {
    console.log(`  Looking up: ${firstName} ${lastName} (${city})…`);

    const { data: searchData } = await axios.get<ELSearchResult>(
      'https://enrichlayer.com/api/v2/search/person',
      {
        params: { first_name: firstName, last_name: lastName, city, page_size: 1 },
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      }
    );

    const profileUrl = searchData.results?.[0]?.linkedin_profile_url;
    if (!profileUrl) {
      const result: DiscoveredProfile = { name: `${firstName} ${lastName}`, error: 'Not found' };
      saveLookupToCache(firstName, lastName, result, eventName);
      return result;
    }

    const { data: profile } = await axios.get<ELProfile>(
      'https://enrichlayer.com/api/v2/profile',
      {
        params: { linkedin_profile_url: profileUrl },
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    // Resolve current position
    let currentTitle: string | undefined;
    let currentCompany: string | undefined;
    let currentLocation: string | undefined;

    if (profile.experiences?.length) {
      const current = profile.experiences.find(e => e.ends_at === null) ?? profile.experiences[0];
      currentTitle = current.title;
      currentCompany = current.company;
      currentLocation = current.location ?? profile.location_str;
    }

    const titleToUse = currentTitle ?? profile.occupation ?? 'Not available';
    const priorityTier: ContactPriorityTier = classifyTier(`${titleToUse} ${currentCompany ?? ''}`);
    const isTargetContact = priorityTier !== 'NONE';

    let condensed: string | undefined;
    if (isTargetContact && profile.summary) {
      console.log(`  ⭐ Target contact — condensing summary…`);
      condensed = await condenseSummary(profile.summary);
      if (condensed) console.log(`  ✓ "${condensed}"`);
    }

    const result: DiscoveredProfile = {
      name: profile.full_name ?? `${firstName} ${lastName}`,
      firstName,
      currentTitle: titleToUse,
      currentCompany,
      location: currentLocation ?? profile.location_str,
      linkedInUrl: profileUrl,
      isTargetContact,
      priorityTier,
      summary: profile.summary,
      condensedSummary: condensed,
    };

    saveLookupToCache(firstName, lastName, result, eventName);
    return result;
  } catch (e) {
    return {
      name: `${firstName} ${lastName}`,
      error: axios.isAxiosError(e)
        ? `API error: ${e.response?.status} — ${e.response?.statusText ?? e.message}`
        : e instanceof Error ? e.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// Batch lookup
// ---------------------------------------------------------------------------

export async function lookupProfiles(
  parsedNames: ParsedName[],
  eventName: string
): Promise<DiscoveredProfile[]> {
  const results: DiscoveredProfile[] = [];
  for (const parsed of parsedNames) {
    if (parsed.isValid && parsed.firstName && parsed.lastName) {
      results.push(await lookupLinkedInProfile(parsed.firstName, parsed.lastName, eventName));
    } else {
      console.log(`  Skipping: "${parsed.original}" (${parsed.reason ?? 'needs first and last name'})`);
    }
  }
  return results;
}

import axios from 'axios';
import OpenAI from 'openai';
import { ParsedName } from './nameParser.js';
import { getCachedLookup, saveLookupToCache } from './cache.js';

export type ContactPriorityTier = 'TIER_1' | 'TIER_2' | 'TIER_3' | 'NONE';

// Legacy pattern preserved for backwards compatibility if tier patterns are not configured.
const DEFAULT_TARGET_PATTERN = 'Partner|Capital|VC|Investor|C[TEOFMPI]O|Chief\\s+\\w+\\s+Officer|VP|VPE|Director|DIR\\s+ENG';
const DEFAULT_TIER_1_PATTERN = 'Managing\\s+Partner|General\\s+Partner|\\bPartner\\b|\\bVC\\b|Venture\\s+Capital|\\bInvestor\\b|\\bCapital\\b|C[TEOFMPI]O|Chief\\s+\\w+\\s+Officer';
const DEFAULT_TIER_2_PATTERN = 'Vice\\s+President|\\bVP\\b|\\bVPE\\b|Head\\s+of|\\bPrincipal\\b|\\bDirector\\b|DIR\\s+ENG|Founder|Co-?Founder';
const DEFAULT_TIER_3_PATTERN = '';

function createPattern(pattern: string): RegExp | null {
  const trimmed = pattern.trim();
  return trimmed ? new RegExp(trimmed, 'i') : null;
}

const TIER_1_PATTERN = createPattern(
  process.env.TARGET_TIER_1_PATTERN || DEFAULT_TIER_1_PATTERN
);
const TIER_2_PATTERN = createPattern(
  process.env.TARGET_TIER_2_PATTERN || DEFAULT_TIER_2_PATTERN
);
const TIER_3_PATTERN = createPattern(
  process.env.TARGET_TIER_3_PATTERN || DEFAULT_TIER_3_PATTERN
);
const TARGET_CONTACT_PATTERN = createPattern(
  process.env.TARGET_CONTACT_PATTERN || DEFAULT_TARGET_PATTERN
);

function classifyPriority(combinedText: string): ContactPriorityTier {
  if (TIER_1_PATTERN?.test(combinedText)) {
    return 'TIER_1';
  }
  if (TIER_2_PATTERN?.test(combinedText)) {
    return 'TIER_2';
  }
  if (TIER_3_PATTERN?.test(combinedText)) {
    return 'TIER_3';
  }
  if (TARGET_CONTACT_PATTERN?.test(combinedText)) {
    return 'TIER_2';
  }
  return 'NONE';
}

export interface LinkedInProfile {
  name: string;
  firstName?: string;
  currentTitle?: string;
  currentCompany?: string;
  location?: string;
  linkedinUrl?: string;
  isTargetContact?: boolean;
  priorityTier?: ContactPriorityTier;
  domain?: string;
  summary?: string;
  condensedSummary?: string;
  error?: string;
  connectionSent?: boolean;
}

interface EnrichLayerCreditBalance {
  credit_balance: number;
}

interface EnrichLayerSearchResult {
  results: Array<{
    linkedin_profile_url?: string;
  }>;
}

interface EnrichLayerExperience {
  title: string;
  company: string;
  location?: string;
  starts_at: {
    day?: number;
    month?: number;
    year?: number;
  } | null;
  ends_at: {
    day?: number;
    month?: number;
    year?: number;
  } | null;
}

interface EnrichLayerProfileResult {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  occupation?: string;
  location_str?: string;
  summary?: string;
  experiences?: EnrichLayerExperience[];
}

/**
 * Get the current credit balance from EnrichLayer API
 */
export async function getCreditBalance(): Promise<number | null> {
  const apiToken = process.env.ENRICHLAYER_API_TOKEN;

  if (!apiToken) {
    console.error('ENRICHLAYER_API_TOKEN not set in .env file');
    return null;
  }

  try {
    const response = await axios.get<EnrichLayerCreditBalance>(
      'https://enrichlayer.com/api/v2/credit-balance',
      {
        headers: {
          'Authorization': `Bearer ${apiToken}`
        }
      }
    );

    return response.data.credit_balance;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`Failed to fetch credit balance: ${error.response?.status} - ${error.response?.statusText || error.message}`);
    } else {
      console.error('Failed to fetch credit balance');
    }
    return null;
  }
}

/**
 * Condense a LinkedIn summary to maximum 4 words using OpenAI
 */
async function condenseSummary(summary: string): Promise<string | undefined> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    return undefined;
  }

  try {
    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You condense LinkedIn profile summaries into exactly 4 words or less that capture the essence of the person\'s professional identity. Return only the condensed phrase, nothing else.'
        },
        {
          role: 'user',
          content: `Condense this LinkedIn summary to 4 words or less: ${summary}`
        }
      ],
      temperature: 0.7,
      max_tokens: 20
    });

    return response.choices[0]?.message?.content?.trim();
  } catch (error) {
    console.error('Failed to condense summary with OpenAI:', error instanceof Error ? error.message : 'Unknown error');
    return undefined;
  }
}

/**
 * Lookup a person's LinkedIn profile using EnrichLayer API
 *
 * This function:
 * 1. Checks local cache first to avoid unnecessary API calls
 * 2. If not cached: Searches for the person by name and city (from SEARCH_CITY env)
 * 3. Gets the LinkedIn profile URL from the first search result
 * 4. Fetches detailed profile information
 * 5. Extracts the most recent job title (where ends_at is null)
 * 6. Saves the result to cache for future lookups
 */
export async function lookupLinkedInProfile(
  firstName: string,
  lastName: string,
  eventName: string
): Promise<LinkedInProfile> {
  // Check cache first
  const cached = getCachedLookup(firstName, lastName, eventName);
  if (cached) {
    console.log(`  [CACHED] ${firstName} ${lastName}`);
    return cached;
  }

  const apiToken = process.env.ENRICHLAYER_API_TOKEN;

  if (!apiToken) {
    return {
      name: `${firstName} ${lastName}`,
      error: 'ENRICHLAYER_API_TOKEN not set in .env file'
    };
  }

  const searchCity = process.env.SEARCH_CITY || 'San Francisco';
  // EnrichLayer API expects city value wrapped in quotes
  const cityParam = `"${searchCity}"`;

  try {
    console.log(`  Looking up: ${firstName} ${lastName} (${searchCity})...`);

    // Step 1: Search for the person by name and city
    const searchResponse = await axios.get<EnrichLayerSearchResult>(
      'https://enrichlayer.com/api/v2/search/person',
      {
        params: {
          first_name: firstName,
          last_name: lastName,
          city: cityParam,
          page_size: 1
        },
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Accept': 'application/json'
        }
      }
    );

    // Check if we got any results
    if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
      const notFoundResult = {
        name: `${firstName} ${lastName}`,
        error: 'Not found'
      };
      // Cache failed lookup to avoid repeated API calls
      saveLookupToCache(firstName, lastName, notFoundResult, eventName);
      return notFoundResult;
    }

    const linkedinProfileUrl = searchResponse.data.results[0].linkedin_profile_url;

    if (!linkedinProfileUrl) {
      const noUrlResult = {
        name: `${firstName} ${lastName}`,
        error: 'Not found'
      };
      // Cache failed lookup to avoid repeated API calls
      saveLookupToCache(firstName, lastName, noUrlResult, eventName);
      return noUrlResult;
    }

    // Step 2: Get detailed profile information
    const profileResponse = await axios.get<EnrichLayerProfileResult>(
      'https://enrichlayer.com/api/v2/profile',
      {
        params: {
          linkedin_profile_url: linkedinProfileUrl
        },
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const profile = profileResponse.data;

    // Step 3: Find the most recent experience (where ends_at is null)
    let currentTitle: string | undefined;
    let currentCompany: string | undefined;
    let currentLocation: string | undefined;

    if (profile.experiences && profile.experiences.length > 0) {
      // Find the current position (ends_at is null)
      const currentExperience = profile.experiences.find(exp => exp.ends_at === null);

      if (currentExperience) {
        currentTitle = currentExperience.title;
        currentCompany = currentExperience.company;
        currentLocation = currentExperience.location || profile.location_str;
      } else {
        // If no current position, use the most recent one (first in the list)
        const recentExperience = profile.experiences[0];
        currentTitle = recentExperience.title;
        currentCompany = recentExperience.company;
        currentLocation = recentExperience.location || profile.location_str;
      }
    }

    // Fallback to occupation if no experience found
    const titleToUse = currentTitle || profile.occupation || 'Not available';
    const companyToUse = currentCompany;

    // Determine priority tier from title + company text.
    const combinedText = `${titleToUse} ${companyToUse || ''}`;
    const priorityTier = classifyPriority(combinedText);
    const isTargetContact = priorityTier !== 'NONE';

    // Condense summary using OpenAI only for target contacts
    let condensed: string | undefined;
    if (isTargetContact && profile.summary) {
      console.log(`  ⭐ Target contact - Condensing summary with OpenAI...`);
      condensed = await condenseSummary(profile.summary);
      if (condensed) {
        console.log(`  ✓ Condensed to: "${condensed}"`);
      } else {
        console.log(`  ⚠️  OpenAI condensation failed or API key not configured`);
      }
    }

    const result: LinkedInProfile = {
      name: profile.full_name || `${firstName} ${lastName}`,
      firstName: firstName,
      currentTitle: titleToUse,
      currentCompany: companyToUse,
      location: currentLocation || profile.location_str,
      linkedinUrl: linkedinProfileUrl,
      isTargetContact,
      priorityTier,
      summary: profile.summary,
      condensedSummary: condensed
    };

    // Save successful lookup to cache
    saveLookupToCache(firstName, lastName, result, eventName);

    return result;

  } catch (error) {
    if (axios.isAxiosError(error)) {
      return {
        name: `${firstName} ${lastName}`,
        error: `API error: ${error.response?.status} - ${error.response?.statusText || error.message}`
      };
    }

    return {
      name: `${firstName} ${lastName}`,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Lookup LinkedIn profiles for all valid names
 */
export async function lookupProfiles(
  parsedNames: ParsedName[],
  eventName: string
): Promise<LinkedInProfile[]> {
  const results: LinkedInProfile[] = [];

  for (const parsed of parsedNames) {
    if (parsed.isValid && parsed.firstName && parsed.lastName) {
      const profile = await lookupLinkedInProfile(
        parsed.firstName,
        parsed.lastName,
        eventName
      );
      results.push(profile);
    } else {
      console.log(`  Skipping: "${parsed.original}" (needs first and last name)`);
    }
  }

  return results;
}

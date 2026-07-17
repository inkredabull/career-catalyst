import { ENRICHLAYER_BASE_URL } from '../config';
import type { EnrichLayerProfile } from '../types';

export interface EnrichLayerClientOptions {
  apiToken: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

/** Resolve API token — EnrichLayer is the current provider (Proxycurl was acquired/sunset) */
export const resolveEnrichLayerToken = (): string | undefined =>
  process.env.ENRICHLAYER_API_TOKEN ?? process.env.PROXYCURL_API_KEY;

export class EnrichLayerClient {
  private apiToken: string;
  private baseUrl: string;
  private fetchFn: typeof fetch;

  constructor(options: EnrichLayerClientOptions) {
    this.apiToken = options.apiToken;
    this.baseUrl = options.baseUrl ?? ENRICHLAYER_BASE_URL;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  /** Fetch LinkedIn profile via EnrichLayer Person Profile API */
  async getLinkedInProfile(linkedInUrl: string): Promise<EnrichLayerProfile> {
    const url = new URL(`${this.baseUrl}/profile`);
    url.searchParams.set('linkedin_profile_url', linkedInUrl);
    url.searchParams.set('use_cache', 'if-present');
    url.searchParams.set('fallback_to_cache', 'on-error');

    const response = await this.fetchFn(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`EnrichLayer error ${response.status}: ${await response.text()}`);
    }

    return (await response.json()) as EnrichLayerProfile;
  }
}

export const extractRoleChangeHook = (profile: EnrichLayerProfile): string | null => {
  const current = profile.experiences?.find(exp => exp.ends_at == null);
  if (!current?.title || !current.company) return null;
  return `Currently ${current.title} at ${current.company}`;
};

export const extractHeadlineHook = (profile: EnrichLayerProfile): string | null => {
  const headline = profile.headline?.trim() || profile.occupation?.trim();
  if (!headline) return null;
  return headline;
};

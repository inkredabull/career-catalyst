import { generateTokensOffline, judgeOffline } from '../src/generation/offline';
import type { EnrichmentResult } from '../src/types';

describe('offline generation', () => {
  const contact = {
    contactId: 'c1',
    displayName: 'Jane Doe',
    email: 'jane@example.com',
    labels: [],
    notes: 'Met at SaaStr 2024',
  };

  it('generates tokens from enrichment without Bedrock', () => {
    const enrichment: EnrichmentResult = {
      contactId: 'c1',
      signals: [
        {
          source: 'contact_notes',
          summary: 'Met at SaaStr 2024. Interested in platform migrations.',
          evidence: 'Met at SaaStr 2024',
        },
      ],
      primarySource: 'contact_notes',
      failedSources: [],
    };

    const tokens = generateTokensOffline(contact, enrichment);
    expect(tokens.Personalization.toLowerCase()).toContain('saastr');
    expect(judgeOffline(tokens).passed).toBe(true);
  });

  it('uses natural check-in copy for LinkedIn-only fallback', () => {
    const enrichment: EnrichmentResult = {
      contactId: 'c1',
      signals: [
        {
          source: 'contact_notes',
          summary: 'Checking in after a while',
          evidence: 'https://www.linkedin.com/in/johnsmith',
        },
      ],
      primarySource: 'contact_notes',
      failedSources: ['enrichlayer_profile'],
    };

    const tokens = generateTokensOffline(contact, enrichment);
    expect(tokens.Personalization).toContain('Jane');
    expect(tokens.Personalization).not.toContain('I noticed reconnecting');
  });
});

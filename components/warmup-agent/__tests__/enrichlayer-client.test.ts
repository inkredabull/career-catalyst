import {
  EnrichLayerClient,
  extractHeadlineHook,
  extractRoleChangeHook,
} from '../src/enrichment/enrichlayer-client';

describe('EnrichLayerClient', () => {
  it('calls EnrichLayer profile endpoint with linkedin_profile_url', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        occupation: 'VP Engineering at Acme',
        experiences: [{ title: 'VP Engineering', company: 'Acme', ends_at: null }],
      }),
    });

    const client = new EnrichLayerClient({
      apiToken: 'test-token',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await client.getLinkedInProfile('https://www.linkedin.com/in/johnsmith');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('enrichlayer.com/api/v2/profile'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      })
    );
    expect(mockFetch.mock.calls[0]![0]).toContain('linkedin_profile_url=');
  });

  it('extracts role and headline hooks from EnrichLayer shape', () => {
    const profile = {
      occupation: 'Building platforms',
      experiences: [{ title: 'Staff Engineer', company: 'Acme', ends_at: null }],
    };

    expect(extractRoleChangeHook(profile)).toBe('Currently Staff Engineer at Acme');
    expect(extractHeadlineHook(profile)).toBe('Building platforms');
  });
});

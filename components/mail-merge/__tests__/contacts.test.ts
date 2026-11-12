import { getLinkedInUrl, selectWarmupCandidates } from '../src/services/contacts';

type Person = Parameters<typeof getLinkedInUrl>[0];

const personWithUrls = (urls: { type?: string; value?: string }[]): Person =>
  ({ urls } as unknown as Person);

const personWith = (opts: { name?: string; email?: string }): Person => ({
  names: opts.name ? [{ displayName: opts.name }] : [],
  emailAddresses: opts.email ? [{ value: opts.email, type: 'home' }] : [],
} as unknown as Person);

describe('getLinkedInUrl', () => {
  it('matches a url whose type is "linkedin", case-insensitively', () => {
    const person = personWithUrls([
      { type: 'Work', value: 'https://example.com' },
      { type: 'LinkedIn', value: 'https://linkedin.com/in/someone' },
    ]);
    expect(getLinkedInUrl(person)).toBe('https://linkedin.com/in/someone');
  });

  it('matches by value containing linkedin.com when type is absent or different', () => {
    const person = personWithUrls([
      { type: 'other', value: 'https://www.linkedin.com/in/someone' },
    ]);
    expect(getLinkedInUrl(person)).toBe('https://www.linkedin.com/in/someone');
  });

  it('returns empty string when no url matches', () => {
    const person = personWithUrls([{ type: 'work', value: 'https://example.com' }]);
    expect(getLinkedInUrl(person)).toBe('');
  });

  it('returns empty string when urls is undefined', () => {
    const person = {} as Person;
    expect(getLinkedInUrl(person)).toBe('');
  });
});

describe('selectWarmupCandidates', () => {
  const NOW = Date.parse('2026-06-01T00:00:00Z');
  const sixtyOneDaysAgo = NOW - 61 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = NOW - 30 * 24 * 60 * 60 * 1000;
  const cutoffMs = NOW - 60 * 24 * 60 * 60 * 1000;

  it('picks contacts not contacted within the cutoff, skipping ones contacted recently', () => {
    const recent = personWith({ name: 'Recent Person', email: 'recent@example.com' });
    const stale = personWith({ name: 'Stale Person', email: 'stale@example.com' });
    const neverContacted = personWith({ name: 'Never Contacted', email: 'never@example.com' });

    const lastContacted: Record<string, number | null> = {
      'recent@example.com': thirtyDaysAgo,
      'stale@example.com': sixtyOneDaysAgo,
      'never@example.com': null,
    };

    const result = selectWarmupCandidates(
      [recent, stale, neverContacted], 2, cutoffMs, 50, email => lastContacted[email] ?? null
    );

    expect(result.picked.map(c => c.email)).toEqual(['stale@example.com', 'never@example.com']);
    expect(result.skippedRecent).toBe(1);
    expect(result.skippedNoEmail).toBe(0);
    expect(result.checked).toBe(3);
  });

  it('skips contacts with no email and backfills from later candidates', () => {
    const noEmail = personWith({ name: 'No Email' });
    const qualifies = personWith({ name: 'Qualifies', email: 'qualifies@example.com' });

    const result = selectWarmupCandidates([noEmail, qualifies], 1, cutoffMs, 50, () => null);

    expect(result.picked.map(c => c.email)).toEqual(['qualifies@example.com']);
    expect(result.skippedNoEmail).toBe(1);
  });

  it('stops once count is reached without checking remaining candidates', () => {
    const a = personWith({ name: 'A', email: 'a@example.com' });
    const b = personWith({ name: 'B', email: 'b@example.com' });
    const c = personWith({ name: 'C', email: 'c@example.com' });

    const result = selectWarmupCandidates([a, b, c], 2, cutoffMs, 50, () => null);

    expect(result.picked).toHaveLength(2);
    expect(result.checked).toBe(2);
  });

  it('stops at maxCandidatesToCheck even if count was not reached', () => {
    const contacts = [
      personWith({ name: 'A', email: 'a@example.com' }),
      personWith({ name: 'B', email: 'b@example.com' }),
      personWith({ name: 'C', email: 'c@example.com' }),
    ];

    const result = selectWarmupCandidates(contacts, 5, cutoffMs, 2, () => sixtyOneDaysAgo);

    expect(result.checked).toBe(2);
    expect(result.picked).toHaveLength(2);
  });
});

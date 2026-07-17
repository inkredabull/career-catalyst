import {
  daysSince,
  hasEnrichableUrl,
  resolveEnrichmentSources,
  scoreContact,
  rankContacts,
  isExcludedContact,
} from '../src/scoring/contact-scorer';
import type { ScorableContact } from '../src/types';

const baseContact: ScorableContact = {
  contactId: 'people/c1',
  displayName: 'Jane Doe',
  email: 'jane@example.com',
  labels: ['Archetype/Mentor'],
  relationshipTier: 'Archetype/Mentor',
};

describe('contact-scorer', () => {
  const now = new Date('2026-07-17');

  it('scores higher when last warmup was longer ago', () => {
    const recent: ScorableContact = {
      ...baseContact,
      contactId: 'recent',
      lastWarmupDate: new Date('2026-07-01'),
    };
    const stale: ScorableContact = {
      ...baseContact,
      contactId: 'stale',
      lastWarmupDate: new Date('2025-01-01'),
    };

    const recentScore = scoreContact(recent, now).totalScore;
    const staleScore = scoreContact(stale, now).totalScore;
    expect(staleScore).toBeGreaterThan(recentScore);
  });

  it('prefers contacts with enrichable URLs', () => {
    const withUrl = scoreContact(
      { ...baseContact, blogUrl: 'https://example.com/feed.xml' },
      now
    );
    const withoutUrl = scoreContact(baseContact, now);
    expect(withUrl.breakdown.enrichableUrl).toBe(100);
    expect(withoutUrl.breakdown.enrichableUrl).toBe(0);
  });

  it('resolves enrichment sources in priority order', () => {
    const sources = resolveEnrichmentSources({
      ...baseContact,
      blogUrl: 'https://example.com/feed.xml',
      linkedInUrl: 'https://linkedin.com/in/jane',
      notes: 'hello',
    });
    expect(sources[0]).toBe('blog_rss');
    expect(sources).toContain('enrichlayer_profile');
  });

  it('excludes unhelpful contacts and blocked emails', () => {
    const excluded = isExcludedContact(
      { ...baseContact, labels: ['Archetype/Unhelpful'] },
      ['Archetype/Unhelpful'],
      new Set()
    );
    expect(excluded).toBe(true);

    const emailBlocked = isExcludedContact(
      baseContact,
      [],
      new Set(['jane@example.com'])
    );
    expect(emailBlocked).toBe(true);
  });

  it('ranks and limits contact count', () => {
    const contacts: ScorableContact[] = [
      { ...baseContact, contactId: 'a', lastWarmupDate: new Date('2026-06-01') },
      { ...baseContact, contactId: 'b', lastWarmupDate: new Date('2024-01-01') },
      { ...baseContact, contactId: 'c', lastWarmupDate: new Date('2025-01-01') },
    ];
    const ranked = rankContacts(contacts, 2, now);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]!.contactId).toBe('b');
  });

  it('daysSince returns 365 when date is missing', () => {
    expect(daysSince(undefined, now)).toBe(365);
  });

  it('hasEnrichableUrl detects linkedin, blog, twitter', () => {
    expect(hasEnrichableUrl({ ...baseContact, twitterHandle: '@jane' })).toBe(true);
    expect(hasEnrichableUrl(baseContact)).toBe(false);
  });
});

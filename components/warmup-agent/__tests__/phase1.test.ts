import { parseRssItems } from '../src/enrichment/rss';
import { renderWarmupTemplate } from '../src/generation/template-renderer';
import { fallbackTokens } from '../src/generation/generator';
import { buildDigestEmail } from '../src/notifications/digest';
import type { ContactRunResult, RunResult } from '../src/types';

const SAMPLE_RSS = `<?xml version="1.0"?>
<rss><channel>
  <item>
    <title>Platform Migrations at Scale</title>
    <link>https://example.com/post1</link>
    <pubDate>Mon, 12 Jul 2026 10:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

describe('rss', () => {
  it('parses RSS items', () => {
    const items = parseRssItems(SAMPLE_RSS);
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe('Platform Migrations at Scale');
  });
});

describe('template-renderer', () => {
  it('fills dynamic and static tokens', () => {
    const contact = {
      contactId: 'c1',
      displayName: 'Jane Doe',
      email: 'jane@example.com',
      labels: [],
    };
    const draft = renderWarmupTemplate(contact, 'Quick catch-up', {
      ...fallbackTokens(contact),
      Zeitgeisty: 'Saw your post on migrations.\n\n',
      Personalization: 'Would love to hear how that went.',
    });

    expect(draft.bodyText).toContain('Hi Jane,');
    expect(draft.bodyText).toContain('Saw your post on migrations.');
    expect(draft.bodyText).toContain('Either way,');
    expect(draft.bodyText).toContain('contacts.google.com');
  });
});

describe('digest', () => {
  it('builds digest with draft counts', () => {
    const result: RunResult = {
      runId: 'abc123',
      createdAt: new Date().toISOString(),
      totalCostUsd: 0.05,
      digestSent: false,
      contacts: [
        {
          contactId: 'c1',
          displayName: 'Jane',
          email: 'jane@example.com',
          status: 'DRAFT_CREATED',
          iterations: 1,
          costUsd: 0.01,
          hook: {
            hookType: 'blog_post',
            hookText: 'Blog post reference',
            confidence: 0.85,
            evidence: 'Platform post',
            source: 'blog_rss',
          },
          judge: { score: 88, passed: true, feedback: 'Good', concerns: [] },
          draftUrl: 'https://mail.google.com/draft/1',
        } as ContactRunResult,
      ],
    };

    const digest = buildDigestEmail(result);
    expect(digest.subject).toContain('1 drafts ready');
    expect(digest.body).toContain('Jane');
    expect(digest.body).toContain('abc123');
  });
});

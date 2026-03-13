// Integration test gate — run before deploying to catch unresolved tokens.
// Requires unified-server running at localhost:3000
// Run with: npm run test:integration

import { fillInTemplateFromObject } from '../../src/services/gmail';
import { clearJobMetadataCache } from '../../src/services/job-metadata';

const TEST_JOB_ID = '6237220d';

const DEFAULT_TEMPLATE = {
  subject: 'Get your help for {{JobTitleShorthand}} role at {{Company}}?',
  text: '{{Blurb}}\n\n{{Intro}}\n\n{{Ask}}\n\n{{Valediction}}',
  html: '',
};

const makeRow = (jobId: string, extras: Record<string, string> = {}): Record<string, string> => ({
  JobID: jobId,
  PersonName: '',
  PersonURL: '',
  First: 'Test',
  Recipient: 'test@example.com',
  ...extras,
});

beforeEach(() => {
  clearJobMetadataCache(TEST_JOB_ID);
  (global as any).CacheService.getScriptCache().remove(`job_${TEST_JOB_ID}`);
});

describe('template preview gate (integration — localhost:3000)', () => {
  it('resolves all tokens with no {{placeholders}} remaining', () => {
    const resolved = fillInTemplateFromObject(DEFAULT_TEMPLATE, makeRow(TEST_JOB_ID));

    console.log('\n=== SUBJECT ===\n', resolved.subject);
    console.log('\n=== BODY ===\n', resolved.text);

    const unresolvedSubject = resolved.subject.match(/\{\{[^}]+\}\}/g) ?? [];
    const unresolvedBody = resolved.text.match(/\{\{[^}]+\}\}/g) ?? [];
    const all = [...unresolvedSubject, ...unresolvedBody];

    if (all.length > 0) {
      console.error('\nUnresolved tokens:', [...new Set(all)]);
    }

    expect(unresolvedSubject).toHaveLength(0);
    expect(unresolvedBody).toHaveLength(0);
  });

  it('populates Company and JobTitleShorthand from job metadata', () => {
    const resolved = fillInTemplateFromObject(
      { subject: '{{Company}} — {{JobTitleShorthand}}', text: '', html: '' },
      makeRow(TEST_JOB_ID)
    );
    console.log('Company/Title:', resolved.subject);
    expect(resolved.subject).not.toBe(' — ');
    expect(resolved.subject).not.toMatch(/\{\{/);
  });
});

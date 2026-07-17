import { readFileSync } from 'fs';
import { join } from 'path';
import { planRun } from '../src/planner/run-planner';
import { loadContactsFromJson } from '../src/contacts/loader';

describe('run-planner', () => {
  const fixturePath = join(__dirname, '../fixtures/contacts.sample.json');
  const contacts = loadContactsFromJson(readFileSync(fixturePath, 'utf-8'));
  const now = new Date('2026-07-17');

  it('excludes unhelpful contacts', () => {
    const spec = planRun({ contacts, history: [], count: 5, now });
    expect(spec.contacts.every(c => c.contact.displayName !== 'Sam Unhelpful')).toBe(true);
    expect(spec.excludedCount).toBeGreaterThanOrEqual(1);
  });

  it('returns requested contact count', () => {
    const spec = planRun({ contacts, history: [], count: 3, now });
    expect(spec.contacts).toHaveLength(3);
  });

  it('assigns enrichment plan and subject variant per contact', () => {
    const spec = planRun({ contacts, history: [], count: 2, now });
    for (const item of spec.contacts) {
      expect(item.score.totalScore).toBeGreaterThan(0);
      expect(item.subjectVariantId).toBeTruthy();
      expect(item.subjectLine).toBeTruthy();
      expect(item.enrichmentPlanDescription).toBeTruthy();
    }
  });

  it('prefers contacts not recently warmed up when history exists', () => {
    const history = [
      {
        contactId: 'people/c1111111111111111111',
        name: 'Jane Doe',
        email: 'jane@example.com',
        lastWarmup: '2026-07-01',
        status: 'DRAFT_CREATED' as const,
      },
    ];

    const spec = planRun({ contacts, history, count: 3, now });
    const janeRank = spec.contacts.findIndex(c => c.contact.contactId === 'people/c1111111111111111111');
    if (janeRank >= 0 && spec.contacts.length > 1) {
      expect(spec.contacts[0]!.contact.contactId).not.toBe('people/c1111111111111111111');
    }
  });
});

import {
  pickSubjectVariantRoundRobin,
  renderSubjectTemplate,
  aggregateVariantPerformance,
  SUBJECT_VARIANTS,
} from '../src/subjects/subject-ab';
import type { WarmupHistoryRow } from '../src/types';

describe('subject-ab', () => {
  it('renders template tokens', () => {
    const subject = renderSubjectTemplate('{{First}} — quick ask', { First: 'Jane' });
    expect(subject).toBe('Jane — quick ask');
  });

  it('strips unreplaced tokens', () => {
    const subject = renderSubjectTemplate('{{ZeitgeistSnippet}} — ask', {});
    expect(subject).toBe('— ask');
  });

  it('round-robin picks least-used variant', () => {
    const history: WarmupHistoryRow[] = SUBJECT_VARIANTS.map((variant, i) => ({
      contactId: `c${i}`,
      name: 'Test',
      email: 'test@example.com',
      subjectVariant: variant.id,
      status: 'DRAFT_CREATED',
    }));

    const assignment = pickSubjectVariantRoundRobin(history, { First: 'Jane' });
    const counts = new Map<string, number>();
    for (const row of history) {
      if (!row.subjectVariant) continue;
      counts.set(row.subjectVariant, (counts.get(row.subjectVariant) ?? 0) + 1);
    }
    const minCount = Math.min(...SUBJECT_VARIANTS.map(v => counts.get(v.id) ?? 0));
    expect(counts.get(assignment.variantId)).toBe(minCount);
  });

  it('aggregates variant performance', () => {
    const history: WarmupHistoryRow[] = [
      {
        contactId: 'c1',
        name: 'A',
        email: 'a@example.com',
        subjectVariant: 'control',
        status: 'DRAFT_CREATED',
        opened: true,
        replied: false,
      },
      {
        contactId: 'c2',
        name: 'B',
        email: 'b@example.com',
        subjectVariant: 'control',
        status: 'DRAFT_CREATED',
        opened: true,
        replied: true,
      },
    ];

    const perf = aggregateVariantPerformance(history);
    const control = perf.find(p => p.variantId === 'control');
    expect(control?.sends).toBe(2);
    expect(control?.openRate).toBe(1);
    expect(control?.replyRate).toBe(0.5);
  });
});

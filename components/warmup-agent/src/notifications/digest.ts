import type { RunResult, ContactRunResult } from '../types';

const confidenceLabel = (confidence?: number): string => {
  if (confidence == null) return 'LOW';
  if (confidence >= 0.8) return 'HIGH';
  if (confidence >= 0.6) return 'MEDIUM';
  return 'LOW';
};

export const formatContactDigestLine = (result: ContactRunResult, index: number): string => {
  if (result.status === 'FAILED') {
    return `${index + 1}. ${result.displayName} — FAILED\n   ${result.error ?? 'Unknown error'}`;
  }

  const hookLine = result.hook
    ? `Hook: ${result.hook.hookText} (${confidenceLabel(result.hook.confidence)})`
    : 'Hook: none';

  const qualityLine = result.judge
    ? `Quality: ${result.judge.score}/100 (${result.iterations} iteration${result.iterations === 1 ? '' : 's'})`
    : '';

  const draftLine = result.draftUrl ? `Draft: ${result.draftUrl}` : 'Draft: (dry run — not created)';

  return [
    `${index + 1}. ${result.displayName} (${result.email}) — ${confidenceLabel(result.hook?.confidence)}`,
    `   ${hookLine}`,
    qualityLine ? `   ${qualityLine}` : '',
    `   ${draftLine}`,
  ]
    .filter(Boolean)
    .join('\n');
};

export const buildDigestEmail = (result: RunResult): { subject: string; body: string } => {
  const created = result.contacts.filter(c => c.status === 'DRAFT_CREATED').length;
  const failed = result.contacts.filter(c => c.status === 'FAILED').length;
  const highConfidence = result.contacts.filter(c => (c.hook?.confidence ?? 0) >= 0.8).length;

  const subject = `Morning Warmup — ${created} drafts ready (${highConfidence} high-confidence hooks)`;

  const lines = [
    `Run ID: ${result.runId} | Cost: $${result.totalCostUsd.toFixed(3)}`,
    '',
    ...result.contacts.map((c, i) => formatContactDigestLine(c, i)),
    '',
    failed > 0 ? `Failed: ${failed} contact(s) did not pass quality gate or enrichment.` : '',
    '',
    'Review drafts in Gmail before sending.',
  ].filter(Boolean);

  return { subject, body: lines.join('\n') };
};

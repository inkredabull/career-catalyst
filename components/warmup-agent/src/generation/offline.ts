import type { EnrichmentResult, GeneratedTokens, HookInfo, HookType } from '../types';
import type { ScorableContact } from '../types';
import { fallbackTokens } from './generator';

const inferHookType = (summary: string): HookType => {
  if (/blog|post|article/i.test(summary)) return 'blog_post';
  if (/currently|at @|role|title/i.test(summary)) return 'role_change';
  if (/twitter|@/i.test(summary)) return 'check_in';
  if (summary.length > 20) return 'notes_reference';
  return 'check_in';
};

export const generateTokensOffline = (
  contact: ScorableContact,
  enrichment: EnrichmentResult
): GeneratedTokens => {
  if (enrichment.signals.length === 0) {
    return fallbackTokens(contact);
  }

  const first = contact.displayName.trim().split(/\s+/)[0] ?? 'there';
  const primary = enrichment.signals[0]!;
  const hookType = inferHookType(primary.summary);
  const hook: HookInfo = {
    hookType,
    hookText: primary.summary.slice(0, 80),
    confidence: hookType === 'check_in' ? 0.4 : 0.75,
    evidence: primary.evidence ?? primary.summary,
    source: primary.source,
  };

  const zeitgeisty =
    hookType === 'blog_post' ? `Saw your recent post — "${primary.evidence}".\n\n` : '';

  let personalization: string;
  if (hookType === 'role_change') {
    personalization = `${primary.summary} — would love to hear how that's going.`;
  } else if (hookType === 'check_in' || /checking in|reconnecting/i.test(primary.summary)) {
    personalization = `${first} — it's been a while. I'd love to hear what you've been up to.`;
  } else if (hookType === 'blog_post') {
    personalization = `Your post caught my eye — wanted to reach out and reconnect.`;
  } else {
    personalization = `${primary.summary} — wanted to reach out and see how you're doing.`;
  }

  return { Zeitgeisty: zeitgeisty, Personalization: personalization, hook };
};

export const judgeOffline = (tokens: GeneratedTokens): {
  score: number;
  passed: boolean;
  feedback: string;
  concerns: string[];
} => {
  const hookScore = Math.round(60 + tokens.hook.confidence * 30);
  const lengthBonus = Math.min(10, Math.floor(tokens.Personalization.length / 12));
  const score = Math.min(100, hookScore + lengthBonus);

  const passed =
    score >= 70 ||
    (tokens.hook.hookType === 'check_in' && tokens.Personalization.length >= 40);

  let feedback = 'Offline heuristic pass';
  if (!passed) {
    feedback =
      tokens.Personalization.length < 20
        ? 'Personalization too short'
        : `Score ${score} below threshold (weak hook, no enrichment)`;
  }

  return {
    score,
    passed,
    feedback,
    concerns: passed ? [] : ['offline_quality'],
  };
};

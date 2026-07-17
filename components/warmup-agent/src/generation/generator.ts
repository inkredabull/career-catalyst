import type { BaseLLMProvider } from '@inkredabull/career-catalyst-core';
import { AGENT_DEFAULTS } from '../config';
import { parseJsonFromLlm, bedrockGenerator } from '../llm/bedrock';
import type {
  EnrichmentResult,
  GeneratedTokens,
  HookInfo,
  HookType,
  ScorableContact,
} from '../types';

export interface GeneratorInput {
  contact: ScorableContact;
  enrichment: EnrichmentResult;
  subjectLine: string;
  feedback?: string;
}

interface GeneratorResponse {
  hookType: HookType;
  hookText: string;
  confidence: number;
  evidence: string;
  zeitgeisty: string;
  personalization: string;
}

export const buildGeneratorPrompt = (input: GeneratorInput): string => {
  const signals = input.enrichment.signals
    .map(s => `- [${s.source}] ${s.summary}${s.url ? ` (${s.url})` : ''}`)
    .join('\n');

  const daysSinceContact = input.contact.lastRealContactDate
    ? Math.floor(
        (Date.now() - input.contact.lastRealContactDate.getTime()) / 86_400_000
      )
    : null;

  return [
    `Write personalized warmup email tokens for ${input.contact.displayName}.`,
    `Email subject: ${input.subjectLine}`,
    daysSinceContact != null ? `Days since last contact: ${daysSinceContact}` : '',
    input.contact.relationshipTier ? `Relationship: ${input.contact.relationshipTier}` : '',
    '',
    'Enrichment signals:',
    signals || '(none — use warm check-in)',
    '',
    input.feedback ? `Previous attempt feedback: ${input.feedback}` : '',
    '',
    'Rules:',
    '- zeitgeisty: 1 short timely sentence + blank line, or empty string if no good hook',
    '- personalization: 1-2 sentences referencing specific evidence; never creepy or stalker-ish',
    '- If evidence is weak, use hookType "check_in" with low confidence',
    '- Do not invent facts not in the signals',
    '',
    'Return JSON only:',
    '{',
    '  "hookType": "blog_post|role_change|headline|notes_reference|check_in",',
    '  "hookText": "short hook label",',
    '  "confidence": 0.0-1.0,',
    '  "evidence": "what you referenced",',
    '  "zeitgeisty": "...",',
    '  "personalization": "..."',
    '}',
  ]
    .filter(Boolean)
    .join('\n');
};

export const fallbackTokens = (contact: ScorableContact): GeneratedTokens => {
  const first = contact.displayName.trim().split(/\s+/)[0] ?? 'there';
  return {
    Zeitgeisty: '',
    Personalization: `${first} — it's been a while. I'd love to hear what you've been up to.`,
    hook: {
      hookType: 'check_in',
      hookText: 'General check-in',
      confidence: 0.3,
      evidence: 'No enrichment signals available',
      source: 'generated',
    },
  };
};

export class WarmupMessageGenerator {
  private llm: BaseLLMProvider;

  constructor(llm: BaseLLMProvider = bedrockGenerator()) {
    this.llm = llm;
  }

  async generate(input: GeneratorInput): Promise<GeneratedTokens> {
    if (input.enrichment.signals.length === 0) {
      return fallbackTokens(input.contact);
    }

    const response = await this.llm.makeRequest({
      prompt: buildGeneratorPrompt(input),
      systemPrompt:
        'You write concise, warm professional outreach tokens. Return valid JSON only.',
    });

    let parsed: GeneratorResponse;
    try {
      parsed = parseJsonFromLlm<GeneratorResponse>(response.text);
    } catch {
      console.warn(
        `⚠️  Generator returned non-JSON for ${input.contact.displayName}; using fallback tokens`
      );
      return fallbackTokens(input.contact);
    }
    const hook: HookInfo = {
      hookType: parsed.hookType,
      hookText: parsed.hookText,
      confidence: parsed.confidence,
      evidence: parsed.evidence,
      source: input.enrichment.primarySource ?? 'generated',
    };

    if (hook.confidence < AGENT_DEFAULTS.minHookConfidence) {
      return {
        ...fallbackTokens(input.contact),
        Personalization: parsed.personalization || fallbackTokens(input.contact).Personalization,
        hook: { ...hook, hookType: 'check_in' },
        rawResponse: response.text,
      };
    }

    return {
      Zeitgeisty: parsed.zeitgeisty ?? '',
      Personalization: parsed.personalization ?? '',
      hook,
      rawResponse: response.text,
    };
  }
}

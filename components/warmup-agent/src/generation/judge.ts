import type { BaseLLMProvider } from '@inkredabull/career-catalyst-core';
import { resolveMinDraftQuality } from '../config';
import { parseJsonFromLlm, bedrockJudge } from '../llm/bedrock';
import type { HookInfo, RenderedDraft, ScorableContact } from '../types';

export interface JudgeInput {
  contact: ScorableContact;
  draft: RenderedDraft;
  hook: HookInfo;
}

interface JudgeResponse {
  score: number;
  passed: boolean;
  feedback: string;
  concerns: string[];
}

export const buildJudgePrompt = (input: JudgeInput): string => [
  `Evaluate this warmup outreach draft for ${input.contact.displayName}.`,
  '',
  `Subject: ${input.draft.subject}`,
  '',
  'Body:',
  input.draft.bodyText,
  '',
  `Hook type: ${input.hook.hookType} (confidence ${input.hook.confidence})`,
  `Evidence: ${input.hook.evidence}`,
  '',
  'Score 0-100 on: specificity, warmth, non-creepiness, professional tone.',
  `Pass threshold: ${resolveMinDraftQuality()}.`,
  'Flag if it references private info, sounds stalker-ish, or is generic fluff.',
  '',
  'Return JSON only:',
  '{ "score": 0-100, "passed": boolean, "feedback": "...", "concerns": ["..."] }',
].join('\n');

export class DraftQualityJudge {
  private llm: BaseLLMProvider;

  constructor(llm: BaseLLMProvider = bedrockJudge()) {
    this.llm = llm;
  }

  async evaluate(input: JudgeInput): Promise<JudgeResponse> {
    const response = await this.llm.makeRequest({
      prompt: buildJudgePrompt(input),
      systemPrompt:
        'You are a strict but fair outreach quality reviewer. Return JSON only — no prose before or after.',
    });

    let parsed: JudgeResponse;
    try {
      parsed = parseJsonFromLlm<JudgeResponse>(response.text);
    } catch {
      console.warn(
        `⚠️  Judge returned non-JSON for ${input.contact.displayName}; using neutral fallback score`
      );
      const threshold = resolveMinDraftQuality();
      const score = threshold <= 0 ? 100 : 50;
      return {
        score,
        passed: score >= threshold,
        feedback: 'Judge response was not valid JSON; applied fallback score',
        concerns: ['judge_parse_error'],
      };
    }

    const threshold = resolveMinDraftQuality();
    return {
      score: parsed.score,
      // Gate on numeric score only — LLM "passed" is advisory (often false even above threshold).
      passed: parsed.score >= threshold,
      feedback: parsed.feedback,
      concerns: parsed.concerns ?? [],
    };
  }
}

export type { JudgeResponse };

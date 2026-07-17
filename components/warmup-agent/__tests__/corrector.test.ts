import type { LLMResponse } from '@inkredabull/career-catalyst-core';
import { WarmupMessageGenerator } from '../src/generation/generator';
import { DraftQualityJudge } from '../src/generation/judge';
import { WarmupCorrector } from '../src/generation/corrector';
import type { PlannedContact } from '../src/planner/run-planner';

const mockLlm = (text: string) =>
  ({
    makeRequest: async () =>
      ({
        text,
        usage: { inputTokens: 100, outputTokens: 50 },
        cost: { inputCost: 0, outputCost: 0, cachingSavings: 0, totalCost: 0 },
      }) as LLMResponse,
    supportsPromptCaching: () => false,
    estimateCost: () => ({ inputCost: 0, outputCost: 0, cachingSavings: 0, totalCost: 0 }),
    calculateActualCost: () => ({ inputCost: 0, outputCost: 0, cachingSavings: 0, totalCost: 0 }),
    getProviderName: () => 'mock',
    getModelName: () => 'mock',
  }) as unknown as import('@inkredabull/career-catalyst-core').BaseLLMProvider;

describe('WarmupCorrector with mocked Bedrock', () => {
  const planned: PlannedContact = {
    contact: {
      contactId: 'c1',
      displayName: 'Jane Doe',
      email: 'jane@example.com',
      labels: [],
      notes: 'Met at SaaStr 2024',
    },
    score: {
      contactId: 'c1',
      displayName: 'Jane Doe',
      totalScore: 90,
      breakdown: {
        daysSinceWarmup: 100,
        daysSinceRealContact: 100,
        enrichableUrl: 0,
        relationshipTier: 10,
        priorDraftQuality: 50,
      },
      enrichmentSources: ['contact_notes'],
      rationale: 'test',
    },
    enrichmentPlanDescription: 'contact_notes',
    subjectVariantId: 'control',
    subjectLine: 'Catching up + a quick ask',
  };

  it('processes contact through enrich → generate → judge', async () => {
    const corrector = new WarmupCorrector(
      new WarmupMessageGenerator(
        mockLlm(
          JSON.stringify({
            hookType: 'notes_reference',
            hookText: 'SaaStr connection',
            confidence: 0.85,
            evidence: 'Met at SaaStr 2024',
            zeitgeisty: '',
            personalization: 'Great meeting you at SaaStr — curious how things evolved since.',
          })
        )
      ),
      new DraftQualityJudge(
        mockLlm(
          JSON.stringify({
            score: 85,
            passed: true,
            feedback: 'Warm and specific',
            concerns: [],
          })
        )
      )
    );

    const result = await corrector.processContact(planned, { dryRun: false });

    expect(result.status).toBe('DRAFT_CREATED');
    expect(result.hook?.hookType).toBe('notes_reference');
    expect(result.draft?.bodyText).toContain('Jane');
    expect(result.judge?.passed).toBe(true);
  });
});

import { AGENT_DEFAULTS } from '../config';
import { WarmupMessageGenerator } from './generator';
import { DraftQualityJudge } from './judge';
import { generateTokensOffline, judgeOffline } from './offline';
import { renderWarmupTemplate } from './template-renderer';
import { executeEnrichment } from '../enrichment/executor';
import { resolveEnrichLayerToken } from '../enrichment/enrichlayer-client';
import type { PlannedContact } from '../planner/run-planner';
import type {
  ContactRunResult,
  EnrichmentResult,
  GeneratedTokens,
  JudgeResult,
  RenderedDraft,
} from '../types';

export interface ActPhaseOptions {
  enrichLayerToken?: string;
  /** @deprecated Use enrichLayerToken */
  proxycurlApiKey?: string;
  dryRun?: boolean;
  maxIterations?: number;
  generator?: WarmupMessageGenerator;
  judge?: DraftQualityJudge;
  fetchFn?: typeof fetch;
}

interface IterationState {
  enrichment: EnrichmentResult;
  tokens: GeneratedTokens;
  draft: RenderedDraft;
  judge: JudgeResult;
  iterations: number;
  costUsd: number;
}

export class WarmupCorrector {
  private generator: WarmupMessageGenerator;
  private judge: DraftQualityJudge;

  constructor(generator?: WarmupMessageGenerator, judge?: DraftQualityJudge) {
    this.generator = generator ?? new WarmupMessageGenerator();
    this.judge = judge ?? new DraftQualityJudge();
  }

  async processContact(
    planned: PlannedContact,
    options: ActPhaseOptions = {}
  ): Promise<ContactRunResult> {
    const maxIterations = options.dryRun ? 1 : (options.maxIterations ?? AGENT_DEFAULTS.maxCorrectIterations);
    let costUsd = 0;
    let feedback: string | undefined;
    let lastState: IterationState | null = null;

    try {
      const enrichment = await executeEnrichment(planned.contact, {
        enrichLayerToken:
          options.enrichLayerToken ??
          options.proxycurlApiKey ??
          resolveEnrichLayerToken(),
        fetchFn: options.fetchFn,
      });

      for (let i = 0; i < maxIterations; i++) {
        let tokens;
        let judgeResult;

        if (options.dryRun) {
          tokens = generateTokensOffline(planned.contact, enrichment);
          const draft = renderWarmupTemplate(
            planned.contact,
            planned.subjectLine,
            tokens
          );
          judgeResult = judgeOffline(tokens);
          lastState = {
            enrichment,
            tokens,
            draft,
            judge: judgeResult,
            iterations: i + 1,
            costUsd,
          };
          if (judgeResult.passed) break;
          continue;
        }

        const generator = options.generator ?? this.generator;
        const judge = options.judge ?? this.judge;

        const genResult = await generator.generate({
          contact: planned.contact,
          enrichment,
          subjectLine: planned.subjectLine,
          feedback,
        });
        costUsd += 0.002;

        tokens = genResult;
        const draft = renderWarmupTemplate(
          planned.contact,
          planned.subjectLine,
          tokens
        );

        judgeResult = await judge.evaluate({
          contact: planned.contact,
          draft,
          hook: tokens.hook,
        });
        costUsd += 0.01;

        lastState = {
          enrichment,
          tokens,
          draft,
          judge: judgeResult,
          iterations: i + 1,
          costUsd,
        };

        if (judgeResult.passed) break;
        feedback = judgeResult.feedback;
      }

      if (!lastState) {
        throw new Error('No iteration completed');
      }

      const passed = lastState.judge.passed;

      return {
        contactId: planned.contact.contactId,
        displayName: planned.contact.displayName,
        email: planned.contact.email,
        status: passed ? 'DRAFT_CREATED' : 'FAILED',
        enrichment: lastState.enrichment,
        hook: lastState.tokens.hook,
        draft: lastState.draft,
        judge: lastState.judge,
        iterations: lastState.iterations,
        costUsd: lastState.costUsd,
        error: passed ? undefined : `Quality gate failed: ${lastState.judge.feedback}`,
      };
    } catch (error) {
      return {
        contactId: planned.contact.contactId,
        displayName: planned.contact.displayName,
        email: planned.contact.email,
        status: 'FAILED',
        iterations: lastState?.iterations ?? 0,
        costUsd,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

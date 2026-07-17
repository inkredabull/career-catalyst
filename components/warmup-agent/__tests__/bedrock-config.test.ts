import {
  BEDROCK_MODELS,
  resolveBedrockInferenceProfileId,
  resolveMinDraftQuality,
} from '../src/config';

describe('bedrock inference profiles', () => {
  it('prefixes bare model IDs with global.', () => {
    expect(resolveBedrockInferenceProfileId('anthropic.claude-sonnet-4-6')).toBe(
      'global.anthropic.claude-sonnet-4-6'
    );
    expect(resolveBedrockInferenceProfileId('anthropic.claude-haiku-4-5-20251001-v1:0')).toBe(
      'global.anthropic.claude-haiku-4-5-20251001-v1:0'
    );
  });

  it('leaves inference profile IDs unchanged', () => {
    expect(
      resolveBedrockInferenceProfileId('us.anthropic.claude-haiku-4-5-20251001-v1:0')
    ).toBe('us.anthropic.claude-haiku-4-5-20251001-v1:0');
  });

  it('exports BEDROCK_MODELS with inference profile prefixes', () => {
    expect(BEDROCK_MODELS.generator).toBe(
      'global.anthropic.claude-haiku-4-5-20251001-v1:0'
    );
    expect(BEDROCK_MODELS.judge).toBe('global.anthropic.claude-sonnet-4-6');
  });

  it('reads WARMUP_MIN_DRAFT_QUALITY from env', () => {
    const prev = process.env.WARMUP_MIN_DRAFT_QUALITY;
    process.env.WARMUP_MIN_DRAFT_QUALITY = '0';
    expect(resolveMinDraftQuality()).toBe(0);
    process.env.WARMUP_MIN_DRAFT_QUALITY = prev;
  });
});

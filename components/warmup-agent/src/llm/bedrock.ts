import { ProviderFactory } from '@inkredabull/career-catalyst-core';
import { BEDROCK_MODELS } from '../config';

export const parseJsonFromLlm = <T>(text: string): T => {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in LLM response');
  return JSON.parse(match[0]) as T;
};

export const createBedrockLlm = (model: string, maxTokens = 1024) =>
  ProviderFactory.create({
    provider: 'bedrock',
    apiKey: '',
    model,
    maxTokens,
    temperature: 0.4,
  });

export const bedrockGenerator = () => createBedrockLlm(BEDROCK_MODELS.generator, 768);
export const bedrockJudge = () => createBedrockLlm(BEDROCK_MODELS.judge, 512);

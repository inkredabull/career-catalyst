import { ProviderFactory } from '@inkredabull/career-catalyst-core';
import { BEDROCK_MODELS } from '../config';

export const parseJsonFromLlm = <T>(text: string): T => {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('No JSON found in LLM response');
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  const match = candidate.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('No JSON found in LLM response');
  }

  try {
    return JSON.parse(match[0]) as T;
  } catch {
    throw new Error('No JSON found in LLM response');
  }
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
export const bedrockJudge = () => createBedrockLlm(BEDROCK_MODELS.judge, 1024);

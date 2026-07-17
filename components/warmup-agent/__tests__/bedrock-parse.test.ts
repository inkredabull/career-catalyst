import { parseJsonFromLlm } from '../src/llm/bedrock';

describe('parseJsonFromLlm', () => {
  it('parses raw JSON objects', () => {
    expect(parseJsonFromLlm<{ score: number }>('{"score": 42}')).toEqual({ score: 42 });
  });

  it('parses fenced JSON blocks', () => {
    const text = 'Here is the result:\n```json\n{"passed": true, "score": 80}\n```';
    expect(parseJsonFromLlm<{ passed: boolean; score: number }>(text)).toEqual({
      passed: true,
      score: 80,
    });
  });

  it('throws on empty or non-JSON text', () => {
    expect(() => parseJsonFromLlm('')).toThrow('No JSON found in LLM response');
    expect(() => parseJsonFromLlm('Just prose, no braces')).toThrow('No JSON found in LLM response');
  });
});

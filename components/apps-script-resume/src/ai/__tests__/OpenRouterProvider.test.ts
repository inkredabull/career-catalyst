import { OpenRouterProvider } from '../OpenRouterProvider';

describe('OpenRouterProvider.generatePayload', () => {
  const provider = new OpenRouterProvider('key');

  it('excludes reasoning tokens from the response for reasoning models', () => {
    const payload = provider.generatePayload('prompt', 80, 'google/gemini-3.8-flash');
    expect(payload.reasoning).toEqual({ exclude: true });
  });

  it('leaves non-reasoning models unaffected', () => {
    const payload = provider.generatePayload('prompt', 80, 'anthropic/claude-sonnet-5');
    expect(payload.reasoning).toBeUndefined();
  });
});

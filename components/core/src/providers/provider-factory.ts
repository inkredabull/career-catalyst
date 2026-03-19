import { BaseLLMProvider, LLMProviderConfig } from './llm-provider';
import { ClaudeProvider } from './claude-provider';
import { OpenAIProvider } from './openai-provider';
import { OpenRouterProvider } from './openrouter-provider';

export class ProviderFactory {
  static create(config: LLMProviderConfig): BaseLLMProvider {
    switch (config.provider) {
      case 'anthropic':
        return new ClaudeProvider(config);
      case 'openai':
        return new OpenAIProvider(config);
      case 'openrouter':
        return new OpenRouterProvider(config);
      default:
        throw new Error(`Unsupported provider: ${config.provider}. Supported: anthropic, openai, openrouter`);
    }
  }
}

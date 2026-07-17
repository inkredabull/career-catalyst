import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { BaseLLMProvider, LLMProviderConfig, LLMRequest, LLMResponse, CostEstimate } from './llm-provider';

interface BedrockClaudeResponse {
  content: Array<{ type: string; text?: string }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/** Per-1M-token Bedrock list pricing (global endpoints, USD). */
const bedrockPricePerMTok = (model: string): { input: number; output: number } => {
  if (model.includes('haiku')) return { input: 1, output: 5 };
  if (model.includes('opus')) return { input: 5, output: 25 };
  return { input: 3, output: 15 }; // sonnet and other mid-tier models
};

/**
 * Amazon Bedrock provider — uses the AWS credential chain (env, profile, IAM role).
 * Supports Anthropic Claude models hosted on Bedrock.
 */
export class BedrockProvider extends BaseLLMProvider {
  private client: BedrockRuntimeClient;

  constructor(config: LLMProviderConfig) {
    super(config);
    const region = config.region ?? process.env.AWS_REGION ?? 'us-east-1';
    this.client = new BedrockRuntimeClient({ region });
  }

  supportsPromptCaching(): boolean {
    return false;
  }

  async makeRequest(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    console.log(`🤖 Sending request to Bedrock (${this.config.model})...`);

    let elapsedSeconds = 0;
    const timerInterval = setInterval(() => {
      elapsedSeconds++;
      process.stdout.write(`\r⏱️  Elapsed time: ${elapsedSeconds}s...`);
    }, 1000);

    try {
      const messages: Array<{ role: string; content: string }> = [];
      if (request.systemPrompt) {
        messages.push({ role: 'user', content: request.systemPrompt });
      }

      let userContent = request.prompt;
      if (request.cachedContent) {
        userContent = `${request.cachedContent}\n\n${request.prompt}`;
      }
      messages.push({ role: 'user', content: userContent });

      const body = JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: this.config.maxTokens ?? 4000,
        temperature: this.config.temperature,
        messages,
      });

      const response = await this.client.send(
        new InvokeModelCommand({
          modelId: this.config.model,
          contentType: 'application/json',
          accept: 'application/json',
          body: new TextEncoder().encode(body),
        })
      );

      clearInterval(timerInterval);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r⏱️  Elapsed time: ${duration}s (complete)\n`);

      const parsed = JSON.parse(new TextDecoder().decode(response.body)) as BedrockClaudeResponse;
      const textContent = parsed.content.find(block => block.type === 'text');

      const usage = {
        inputTokens: parsed.usage.input_tokens,
        outputTokens: parsed.usage.output_tokens,
      };

      console.log(
        `✅ Response received (${usage.inputTokens.toLocaleString()} input tokens, ${usage.outputTokens.toLocaleString()} output tokens)`
      );

      return {
        text: textContent?.text ?? '',
        usage,
        cost: this.calculateActualCost(usage),
      };
    } catch (error) {
      clearInterval(timerInterval);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r⏱️  Elapsed time: ${duration}s (failed)\n`);
      throw error;
    }
  }

  calculateActualCost(usage: { inputTokens: number; outputTokens: number }): {
    inputCost: number;
    outputCost: number;
    cachingSavings: number;
    totalCost: number;
  } {
    const { input: inputPricePerMTok, output: outputPricePerMTok } = bedrockPricePerMTok(
      this.config.model
    );

    const inputCost = (usage.inputTokens / 1_000_000) * inputPricePerMTok;
    const outputCost = (usage.outputTokens / 1_000_000) * outputPricePerMTok;

    return {
      inputCost,
      outputCost,
      cachingSavings: 0,
      totalCost: inputCost + outputCost,
    };
  }

  estimateCost(request: LLMRequest): CostEstimate {
    const estimatedInputTokens = Math.ceil(
      (request.prompt.length + (request.cachedContent?.length ?? 0) + (request.systemPrompt?.length ?? 0)) / 4
    );
    const estimatedOutputTokens = this.config.maxTokens ?? 4000;

    const { input: inputPricePerMTok, output: outputPricePerMTok } = bedrockPricePerMTok(
      this.config.model
    );

    const inputCost = (estimatedInputTokens / 1_000_000) * inputPricePerMTok;
    const outputCost = (estimatedOutputTokens / 1_000_000) * outputPricePerMTok;

    return {
      inputCost,
      outputCost,
      cachingSavings: 0,
      totalCost: inputCost + outputCost,
    };
  }
}

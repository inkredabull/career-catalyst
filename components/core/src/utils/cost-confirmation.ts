import * as readline from 'readline';
import { BaseLLMProvider, LLMRequest } from '../providers/llm-provider';
import { getLLMAutoConfirm } from '../config';

export async function confirmCostEstimate(
  provider: BaseLLMProvider,
  request: LLMRequest,
  stage: string
): Promise<boolean> {
  const estimate = provider.estimateCost(request);

  console.log('\n' + '='.repeat(60));
  console.log(`💰 Cost Estimate for ${stage}`);
  console.log('='.repeat(60));
  console.log(`Provider: ${provider.getProviderName()}`);
  console.log(`Model: ${provider.getModelName()}`);
  console.log(`Input tokens: ~${Math.ceil((request.prompt.length + (request.cachedContent?.length || 0)) / 4).toLocaleString()}`);
  console.log(`Output tokens: ~${(provider['config'].maxTokens || 4000).toLocaleString()}`);
  console.log('');
  console.log(`Input cost: $${estimate.inputCost.toFixed(4)}`);
  console.log(`Output cost: $${estimate.outputCost.toFixed(4)}`);

  if (estimate.cachingSavings > 0) {
    console.log(`Cache savings: -$${estimate.cachingSavings.toFixed(4)} ✅`);
  } else if (!provider.supportsPromptCaching()) {
    console.log(`⚠️  No caching support - full tokens will be charged`);
  }

  console.log('');
  console.log(`TOTAL: $${estimate.totalCost.toFixed(4)}`);
  console.log('='.repeat(60));

  // Check for AUTO_CONFIRM environment variable (useful for CI/testing)
  if (getLLMAutoConfirm()) {
    console.log('✅ Auto-confirmed via LLM_AUTO_CONFIRM\n');
    return true;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Proceed with this cost estimate? (y/N): ', (answer) => {
      rl.close();
      const confirmed = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';

      if (confirmed) {
        console.log('');
        console.log('✅ Confirmed - preparing request...');
      } else {
        console.log('');
        console.log('❌ Cancelled');
      }

      resolve(confirmed);
    });
  });
}

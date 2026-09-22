/**
 * Shared helper for identifying reasoning models routed through OpenRouter.
 *
 * Reasoning models (DeepSeek-R, GPT-5.5, Gemini 3.x thinking, o-series, …) spend
 * tokens on an internal "thinking" pass before the final answer. They need a much
 * higher max_tokens cap, and unless the request explicitly excludes reasoning
 * tokens from the response, some providers (notably Gemini) return that thinking
 * text as the message content instead of a clean final answer.
 *
 * @module ai/reasoningModels
 */

/**
 * Whether an OpenRouter model ID is a reasoning model.
 * @param modelId - Model identifier (e.g. 'google/gemini-3.8-flash')
 * @returns True if the model is a reasoning model
 */
export function checkIsReasoningModel(modelId: string): boolean {
  return (
    modelId.includes('deepseek') ||
    modelId.includes('gpt-5.5') ||
    modelId.includes('gemini-3.') ||
    /\/o\d/.test(modelId)
  );
}

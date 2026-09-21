/**
 * Generic two-stage content customization pipeline.
 *
 * Stage 1 (fast model): analyze variable context (prospect brief, job description, account signals)
 * Stage 2 (quality model + prompt caching): generate customized content from cached static asset
 *
 * The pattern: any stable content asset (CV, pitch deck, one-pager template) paired with
 * variable opportunity context maps onto the same two stages. Wire up concrete agents via
 * ContextAnalyzer and ContentGenerator, then call runContentPipeline.
 */

export interface ContextAnalyzer<TContext> {
  analyze(contextInput: string, staticContent: string): Promise<TContext>;
}

export interface ContentGenerator<TContext, TResult> {
  generate(context: TContext, staticContent: string, contextInput: string): Promise<TResult>;
}

export interface ContentPipelineOptions<TContext, TResult> {
  /** Variable input — changes per opportunity (job description, prospect brief, account signals) */
  contextInput: string;
  /** Stable asset — cached across burst runs (CV, deck template, brand boilerplate) */
  staticContent: string;
  /** Stage 1: fast model that analyzes contextInput and returns structured classification */
  analyzer: ContextAnalyzer<TContext>;
  /** Stage 2: quality model that generates the final asset using cached staticContent */
  generator: ContentGenerator<TContext, TResult>;
}

export async function runContentPipeline<TContext, TResult>(
  options: ContentPipelineOptions<TContext, TResult>
): Promise<TResult> {
  const { contextInput, staticContent, analyzer, generator } = options;

  console.log('🚀 Starting two-stage content pipeline...');

  // Stage 1: fast context analysis
  const context = await analyzer.analyze(contextInput, staticContent);

  // Stage 2: customized content generation with cached static asset
  return generator.generate(context, staticContent, contextInput);
}

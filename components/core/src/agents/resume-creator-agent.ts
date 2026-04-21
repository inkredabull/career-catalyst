// DEPRECATED: ResumeCreatorAgent has been superseded by the parallel pipeline
// (ResumeGeneratorAgent in generator.ts + ParallelResumeOrchestrator).
//
// No active code path reaches this class:
//   - CLI `resume` command exclusively uses ParallelResumeOrchestrator
//   - Auto-workflow resume path in job-extractor-agent.ts is blocked at /generate-resume endpoint
//   - pipeline.ts and job-scorer-agent.ts still import this but are not invoked in normal operation
//
// Full implementation preserved in resume-creator-agent.ts.bak
// Kept as a stub so existing imports compile. Remove stub + .bak together when doing full cleanup.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { JobListing, ResumeResult, PDFValidationGuidance, ClassificationResult } from '../types';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { LLMProviderConfig } from '../providers/llm-provider';

export class ResumeCreatorAgent {
  // Stubbed — see deprecation note above. Implementation in resume-creator-agent.ts.bak
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(..._args: any[]) {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async createResume(..._args: any[]): Promise<any> {
    throw new Error('ResumeCreatorAgent is deprecated. Use ParallelResumeOrchestrator instead.');
  }
}

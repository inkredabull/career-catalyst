import { ResumeClassifierAgent } from './agents/classifier';
import { ResumeCreatorAgent } from './agents/resume-creator-agent';
import { ResumeResult } from './types';
import { BaseLLMProvider, LLMProviderConfig } from './providers/llm-provider';
import * as fs from 'fs';

export interface PipelineOptions {
  jobId: string;
  cvFilePath: string;
  resumeProviderConfig: LLMProviderConfig;
  critiqueProviderConfig: LLMProviderConfig;
  classifierApiKey: string;
  maxRoles?: number;
  mode?: 'builder' | 'leader';
  experienceFormat?: 'standard' | 'split';
  outputPath?: string;
  critique?: boolean;
  skipJudge?: boolean;
}

/**
 * Two-stage resume pipeline:
 *   Agent 1 (Haiku): Classify job posting (~2–4s)
 *   Agent 2 (Sonnet): Generate resume with cached static prompt (~12–18s)
 *
 * Total target: ~15–22s vs ~90s for single-call approach.
 */
export async function runTwoStagePipeline(options: PipelineOptions): Promise<ResumeResult> {
  const {
    jobId,
    cvFilePath,
    resumeProviderConfig,
    critiqueProviderConfig,
    classifierApiKey,
    maxRoles = 4,
    mode = 'leader',
    experienceFormat = 'standard',
    outputPath,
    critique = true,
    skipJudge = false
  } = options;

  // Read job description and CV for the classifier
  const { resolveFromProjectRoot } = await import('./utils/project-root');
  const path = await import('path');

  const jobDir = resolveFromProjectRoot('logs', jobId);
  const jobFiles = fs.readdirSync(jobDir).filter(f => f.startsWith('job-') && f.endsWith('.json'));
  if (jobFiles.length === 0) {
    throw new Error(`No job file found for job ID: ${jobId}`);
  }
  const jobData = JSON.parse(fs.readFileSync(path.join(jobDir, jobFiles[0]), 'utf-8'));
  const cvContent = fs.readFileSync(cvFilePath, 'utf-8');

  // Agent 1: Fast classification with Haiku
  console.log('🚀 Starting two-stage resume pipeline...');
  const classifier = new ResumeClassifierAgent(classifierApiKey);
  const classification = await classifier.classify(jobData.description, cvContent);

  // Agent 2: Full resume generation with pre-computed classification
  const creator = new ResumeCreatorAgent(
    resumeProviderConfig,
    critiqueProviderConfig,
    maxRoles,
    mode,
    experienceFormat
  );

  return creator.createResume(
    jobId,
    cvFilePath,
    outputPath,
    false,   // regenerate = false (generate fresh)
    false,   // generate = false (job description already present)
    critique,
    'programmatic',
    skipJudge,
    classification
  );
}

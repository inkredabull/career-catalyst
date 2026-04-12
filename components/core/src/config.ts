import dotenv from 'dotenv';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { AgentConfig } from './types';
import { LLMProviderConfig } from './providers/llm-provider';

// Find and load .env from project root (supports running from workspace packages)
function loadEnvFromProjectRoot() {
  let currentDir = __dirname;

  // Walk up to find project root (contains package.json with workspaces)
  while (currentDir !== path.dirname(currentDir)) {
    const pkgPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.workspaces) {
          // Found project root, load .env from here
          const envPath = path.join(currentDir, '.env');
          if (fs.existsSync(envPath)) {
            dotenv.config({ path: envPath });
            return;
          }
        }
      } catch {
        // Continue searching
      }
    }
    currentDir = path.dirname(currentDir);
  }

  // Fallback to default behavior
  dotenv.config();
}

loadEnvFromProjectRoot();

export function getConfig(): AgentConfig {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  
  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  return {
    openaiApiKey,
    model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    temperature: process.env.OPENAI_TEMPERATURE ? parseFloat(process.env.OPENAI_TEMPERATURE) : 0.3,
    maxTokens: process.env.OPENAI_MAX_TOKENS ? parseInt(process.env.OPENAI_MAX_TOKENS) : 2000,
  };
}

export function getAnthropicConfig(): { anthropicApiKey: string; model: string; maxTokens: number; maxRoles: number } {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }

  return {
    anthropicApiKey,
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929',
    maxTokens: process.env.ANTHROPIC_MAX_TOKENS ? parseInt(process.env.ANTHROPIC_MAX_TOKENS) : 8000,
    maxRoles: process.env.MAX_ROLES ? parseInt(process.env.MAX_ROLES) : 4,
  };
}

export function getAutoResumeConfig(): { threshold: number; cvPath: string | null } {
  return {
    threshold: process.env.AUTO_RESUME_THRESHOLD ? parseInt(process.env.AUTO_RESUME_THRESHOLD) : 80,
    cvPath: process.env.AUTO_RESUME_CV_PATH || null,
  };
}

export function getCritiqueAndJudgeMaxAttempts(): number {
  return process.env.CRITIQUE_AND_JUDGE_MAX_ATTEMPTS ? parseInt(process.env.CRITIQUE_AND_JUDGE_MAX_ATTEMPTS) : 2;
}

export function getResumeOutputDir(): string {
  const envDir = process.env.RESUME_OUTPUT_DIR;
  if (envDir) {
    // Handle tilde expansion for home directory
    if (envDir.startsWith('~/')) {
      const homeDir = os.homedir();
      return path.join(homeDir, envDir.slice(2));
    }
    return envDir;
  }

  // Fallback to default Google Drive location
  const homeDir = os.homedir();
  return path.join(homeDir, 'Google Drive', 'My Drive', 'Professional', 'Job Search', 'Applications', 'Resumes');
}

export interface ResumeGenerationConfig {
  // Resume generation provider
  resumeProvider: 'anthropic' | 'openai' | 'openrouter';
  resumeModel: string;
  resumeApiKey: string;

  // Critique provider
  critiqueProvider: 'anthropic' | 'openai' | 'openrouter';
  critiqueModel: string;
  critiqueApiKey: string;

  // Settings
  maxTokens: number;
  maxRoles: number;
  temperature: number;
}

export function getBlurbConfig(): LLMProviderConfig {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is required for blurb generation');
  }
  return {
    provider: 'openrouter',
    apiKey,
    model: process.env.BLURB_LLM_MODEL ?? 'google/gemini-2.0-flash-001',
    maxTokens: 600,
    temperature: 0.7
  };
}

export function getResumeGenerationConfig(): ResumeGenerationConfig {
  // Resume provider - REQUIRED (no default)
  const resumeProvider = process.env.RESUME_LLM_PROVIDER as 'anthropic' | 'openai' | 'openrouter' | undefined;
  if (!resumeProvider) {
    throw new Error(
      'RESUME_LLM_PROVIDER environment variable is required.\n' +
      'Set to "anthropic", "openai", or "openrouter" in your .env file.'
    );
  }

  if (!['anthropic', 'openai', 'openrouter'].includes(resumeProvider)) {
    throw new Error(
      `Invalid RESUME_LLM_PROVIDER: "${resumeProvider}"\n` +
      'Must be "anthropic", "openai", or "openrouter"'
    );
  }

  // Resume model - REQUIRED (no default)
  const resumeModel = process.env.RESUME_LLM_MODEL;
  if (!resumeModel) {
    throw new Error(
      'RESUME_LLM_MODEL environment variable is required.\n' +
      'Examples:\n' +
      '  - Anthropic: claude-haiku-4-5-20251001, claude-sonnet-4-5-20250929\n' +
      '  - OpenAI: gpt-4o-mini, gpt-4o, gpt-5.2-2025-12-11'
    );
  }

  // Resume API key
  const resumeApiKey = resumeProvider === 'anthropic'
    ? process.env.ANTHROPIC_API_KEY
    : resumeProvider === 'openrouter'
      ? process.env.OPENROUTER_API_KEY
      : process.env.OPENAI_API_KEY;

  if (!resumeApiKey) {
    const keyName = resumeProvider === 'anthropic' ? 'ANTHROPIC_API_KEY'
      : resumeProvider === 'openrouter' ? 'OPENROUTER_API_KEY'
      : 'OPENAI_API_KEY';
    throw new Error(`${keyName} environment variable is required for resume generation`);
  }

  // Critique provider - REQUIRED (no default)
  const critiqueProvider = process.env.CRITIQUE_LLM_PROVIDER as 'anthropic' | 'openai' | 'openrouter' | undefined;
  if (!critiqueProvider) {
    throw new Error(
      'CRITIQUE_LLM_PROVIDER environment variable is required.\n' +
      'Set to "anthropic", "openai", or "openrouter" in your .env file.'
    );
  }

  if (!['anthropic', 'openai', 'openrouter'].includes(critiqueProvider)) {
    throw new Error(
      `Invalid CRITIQUE_LLM_PROVIDER: "${critiqueProvider}"\n` +
      'Must be "anthropic", "openai", or "openrouter"'
    );
  }

  // Critique model - REQUIRED (no default)
  const critiqueModel = process.env.CRITIQUE_LLM_MODEL;
  if (!critiqueModel) {
    throw new Error(
      'CRITIQUE_LLM_MODEL environment variable is required.\n' +
      'Examples:\n' +
      '  - Anthropic: claude-sonnet-4-5-20250929\n' +
      '  - OpenAI: gpt-4o, gpt-5.2-2025-12-11'
    );
  }

  // Critique API key
  const critiqueApiKey = critiqueProvider === 'anthropic'
    ? process.env.ANTHROPIC_API_KEY
    : critiqueProvider === 'openrouter'
      ? process.env.OPENROUTER_API_KEY
      : process.env.OPENAI_API_KEY;

  if (!critiqueApiKey) {
    const keyName = critiqueProvider === 'anthropic' ? 'ANTHROPIC_API_KEY'
      : critiqueProvider === 'openrouter' ? 'OPENROUTER_API_KEY'
      : 'OPENAI_API_KEY';
    throw new Error(`${keyName} environment variable is required for critique`);
  }

  return {
    resumeProvider,
    resumeModel,
    resumeApiKey,
    critiqueProvider,
    critiqueModel,
    critiqueApiKey,
    maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS || '8000'),
    maxRoles: parseInt(process.env.MAX_ROLES || '4'),
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.3')
  };
}

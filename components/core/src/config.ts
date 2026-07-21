import dotenv from 'dotenv';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { AgentConfig } from './types';
import { LLMProviderConfig } from './providers/llm-provider';

const APP_CONFIG_FILE = 'career-catalyst.config.json';

type AppConfig = Record<string, string | number | boolean>;
let _appConfig: AppConfig | null = null;

function findProjectRoot(): string | null {
  let currentDir = __dirname;
  while (currentDir !== path.dirname(currentDir)) {
    const pkgPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.workspaces) return currentDir;
      } catch { /* continue */ }
    }
    currentDir = path.dirname(currentDir);
  }
  return null;
}

function loadEnvFromProjectRoot() {
  const root = findProjectRoot();
  if (root) {
    const envPath = path.join(root, '.env');
    if (fs.existsSync(envPath)) { dotenv.config({ path: envPath }); return; }
  }
  dotenv.config();
}

function loadAppConfig(): AppConfig {
  if (_appConfig) return _appConfig;
  const root = findProjectRoot();
  if (root) {
    const cfgPath = path.join(root, APP_CONFIG_FILE);
    if (fs.existsSync(cfgPath)) {
      try {
        _appConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as AppConfig;
        return _appConfig;
      } catch { /* fall through */ }
    }
  }
  _appConfig = {};
  return _appConfig;
}

/** Resolve a config value: process.env wins, then career-catalyst.config.json, then fallback. */
function cfg(key: string, fallback: string): string {
  if (process.env[key] !== undefined) return process.env[key] as string;
  const ac = loadAppConfig();
  if (ac[key] !== undefined) return String(ac[key]);
  return fallback;
}

loadEnvFromProjectRoot();

export function getConfig(): AgentConfig {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) throw new Error('OPENAI_API_KEY environment variable is required');
  return {
    openaiApiKey,
    model: cfg('OPENAI_MODEL', 'gpt-3.5-turbo'),
    temperature: parseFloat(cfg('OPENAI_TEMPERATURE', '0.3')),
    maxTokens: parseInt(cfg('OPENAI_MAX_TOKENS', '2000')),
  };
}

export function getAnthropicConfig(): { anthropicApiKey: string; model: string; maxTokens: number; maxRoles: number } {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) throw new Error('ANTHROPIC_API_KEY environment variable is required');
  return {
    anthropicApiKey,
    model: cfg('ANTHROPIC_MODEL', 'claude-sonnet-4-5-20250929'),
    maxTokens: parseInt(cfg('ANTHROPIC_MAX_TOKENS', '8000')),
    maxRoles: parseInt(cfg('MAX_ROLES', '4')),
  };
}

export function getAutoResumeConfig(): { threshold: number; cvPath: string | null } {
  return {
    threshold: parseInt(cfg('AUTO_RESUME_THRESHOLD', '80')),
    cvPath: cfg('AUTO_RESUME_CV_PATH', '') || null,
  };
}

export function getCritiqueAndJudgeMaxAttempts(): number {
  return parseInt(cfg('CRITIQUE_AND_JUDGE_MAX_ATTEMPTS', '2'));
}

export function getResumeOutputDir(): string {
  const dir = cfg('RESUME_OUTPUT_DIR', '');
  if (dir) {
    return dir.startsWith('~/') ? path.join(os.homedir(), dir.slice(2)) : dir;
  }
  return path.join(os.homedir(), 'Google Drive', 'My Drive', 'Professional', 'Job Search', 'Applications', 'Resumes');
}

export function getLLMAutoConfirm(): boolean {
  return cfg('LLM_AUTO_CONFIRM', 'false').toLowerCase() === 'true';
}

export function getCvPath(): string {
  const root = findProjectRoot() ?? process.cwd();
  const raw = cfg('CV_PATH', './work-history/cv.txt');
  // Resolve relative paths from project root
  const resolved = path.isAbsolute(raw) ? raw : path.resolve(root, raw);
  if (fs.existsSync(resolved)) return resolved;
  // Fallback discovery
  for (const name of ['work-history/cv.txt', 'cv.txt', 'CV.txt', 'sample-cv.txt']) {
    const p = path.join(root, name);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`CV file not found. Set CV_PATH in career-catalyst.config.json or place cv.txt in the project root.`);
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
  const resumeProvider = cfg('RESUME_LLM_PROVIDER', '') as 'anthropic' | 'openai' | 'openrouter' | '';
  if (!resumeProvider) {
    throw new Error('RESUME_LLM_PROVIDER is required. Set it in career-catalyst.config.json or .env (anthropic | openai | openrouter).');
  }
  if (!['anthropic', 'openai', 'openrouter'].includes(resumeProvider)) {
    throw new Error(`Invalid RESUME_LLM_PROVIDER: "${resumeProvider}". Must be anthropic, openai, or openrouter.`);
  }

  const resumeModel = cfg('RESUME_LLM_MODEL', '');
  if (!resumeModel) {
    throw new Error('RESUME_LLM_MODEL is required. Set it in career-catalyst.config.json or .env.');
  }

  const resumeApiKey = resumeProvider === 'anthropic'
    ? process.env.ANTHROPIC_API_KEY
    : resumeProvider === 'openrouter'
      ? process.env.OPENROUTER_API_KEY
      : process.env.OPENAI_API_KEY;

  if (!resumeApiKey) {
    const keyName = resumeProvider === 'anthropic' ? 'ANTHROPIC_API_KEY'
      : resumeProvider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'OPENAI_API_KEY';
    throw new Error(`${keyName} is required for resume generation`);
  }

  const critiqueProvider = cfg('CRITIQUE_LLM_PROVIDER', '') as 'anthropic' | 'openai' | 'openrouter' | '';
  if (!critiqueProvider) {
    throw new Error('CRITIQUE_LLM_PROVIDER is required. Set it in career-catalyst.config.json or .env.');
  }
  if (!['anthropic', 'openai', 'openrouter'].includes(critiqueProvider)) {
    throw new Error(`Invalid CRITIQUE_LLM_PROVIDER: "${critiqueProvider}". Must be anthropic, openai, or openrouter.`);
  }

  const critiqueModel = cfg('CRITIQUE_LLM_MODEL', '');
  if (!critiqueModel) {
    throw new Error('CRITIQUE_LLM_MODEL is required. Set it in career-catalyst.config.json or .env.');
  }

  const critiqueApiKey = critiqueProvider === 'anthropic'
    ? process.env.ANTHROPIC_API_KEY
    : critiqueProvider === 'openrouter'
      ? process.env.OPENROUTER_API_KEY
      : process.env.OPENAI_API_KEY;

  if (!critiqueApiKey) {
    const keyName = critiqueProvider === 'anthropic' ? 'ANTHROPIC_API_KEY'
      : critiqueProvider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'OPENAI_API_KEY';
    throw new Error(`${keyName} is required for critique`);
  }

  return {
    resumeProvider,
    resumeModel,
    resumeApiKey,
    critiqueProvider,
    critiqueModel,
    critiqueApiKey,
    maxTokens: parseInt(cfg('ANTHROPIC_MAX_TOKENS', '8000')),
    maxRoles: parseInt(cfg('MAX_ROLES', '4')),
    temperature: parseFloat(cfg('OPENAI_TEMPERATURE', '0.3')),
  };
}

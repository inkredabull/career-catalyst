import * as fs from 'fs';
import * as path from 'path';
import { resolveFromProjectRoot } from './project-root';

const SENTINEL_FILE = resolveFromProjectRoot('logs', '.openrouter-model-refresh');
const CONFIG_FILE = resolveFromProjectRoot('parallel-config.json');

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function alreadyRanToday(): boolean {
  try {
    const sentinel = JSON.parse(fs.readFileSync(SENTINEL_FILE, 'utf-8'));
    return sentinel.date === todayISO();
  } catch {
    return false;
  }
}

function markRanToday(): void {
  fs.mkdirSync(path.dirname(SENTINEL_FILE), { recursive: true });
  fs.writeFileSync(SENTINEL_FILE, JSON.stringify({ date: todayISO() }), 'utf-8');
}

/**
 * Strip trailing version suffix to derive the model family prefix.
 * Examples:
 *   "mistralai/mistral-large-2512"   → "mistralai/mistral-large-"
 *   "google/gemini-2.5-flash-001"    → "google/gemini-2.5-flash-"
 *   "google/gemini-2.5-flash"        → "google/gemini-2.5-flash"  (no suffix — exact match only)
 *   "anthropic/claude-3.7-sonnet"    → "anthropic/claude-3.7-sonnet"
 */
function familyPrefix(modelId: string): string {
  return modelId.replace(/-\d{4,}$/, '-').replace(/--$/, '-');
}

export async function maybeRefreshOpenRouterModels(explicitConfigPath?: string): Promise<void> {
  if (alreadyRanToday()) return;

  const configPath = explicitConfigPath ?? CONFIG_FILE;
  if (!fs.existsSync(configPath)) return;

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const openRouterEntries = (config.models ?? []).filter((m: { provider: string }) => m.provider === 'openrouter');
  if (openRouterEntries.length === 0) {
    markRanToday();
    return;
  }

  let allModels: { id: string }[];
  try {
    const apiKey = process.env.OPENROUTER_API_KEY ?? '';
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    const json = await res.json() as { data: { id: string }[] };
    allModels = json.data;
  } catch (err) {
    // Non-blocking: warn but don't mark as ran so it retries next invocation
    console.warn(`⚠️  OpenRouter model refresh failed (network): ${err instanceof Error ? err.message : err}`);
    return;
  }

  let changed = false;
  for (const entry of config.models as { provider: string; model: string; label: string }[]) {
    if (entry.provider !== 'openrouter') continue;

    const prefix = familyPrefix(entry.model);
    const candidates = allModels
      .map(m => m.id)
      .filter(id => id.startsWith(prefix) || id === entry.model)
      .sort();
    const newest = candidates[candidates.length - 1];

    if (newest && newest !== entry.model) {
      console.log(`🔄 OpenRouter model updated: ${entry.model} → ${newest} (${entry.label})`);
      entry.model = newest;
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    console.log('✅ parallel-config.json updated with latest OpenRouter models');
  } else {
    console.log('✅ OpenRouter models up to date');
  }

  markRanToday();
}

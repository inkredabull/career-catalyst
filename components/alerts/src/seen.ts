import { SCRIPT_PROPS } from './config/settings';
import { SearchResults } from './linkedin';

export const SEEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function filterUnseen(results: SearchResults, seen: Record<string, number>): SearchResults {
  const out: SearchResults = {};
  for (const [id, result] of Object.entries(results)) {
    if (!seen[id]) out[id] = result;
  }
  return out;
}

export function markAsSeen(
  results: SearchResults,
  seen: Record<string, number>,
  now: number = Date.now()
): Record<string, number> {
  const updated = { ...seen };
  for (const id of Object.keys(results)) {
    updated[id] = now;
  }
  return updated;
}

export function pruneSeen(
  seen: Record<string, number>,
  now: number = Date.now()
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, ts] of Object.entries(seen)) {
    if (now - ts < SEEN_TTL_MS) out[id] = ts;
  }
  return out;
}

export function loadSeen(): Record<string, number> {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.SEEN_JOB_IDS);
    return raw ? JSON.parse(raw) as Record<string, number> : {};
  } catch { return {}; }
}

export function saveSeen(seen: Record<string, number>): void {
  const pruned = pruneSeen(seen);
  PropertiesService.getScriptProperties().setProperty(
    SCRIPT_PROPS.SEEN_JOB_IDS,
    JSON.stringify(pruned)
  );
}

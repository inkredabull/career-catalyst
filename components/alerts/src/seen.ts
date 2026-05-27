import { put, list, del } from '@vercel/blob';
import { JobResult, SearchResults } from './linkedin';
import { log } from './utils/logger';

export const SEEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SEEN_PATH       = 'alerts/seen.json';
const STOP_LISTS_PATH = 'alerts/stop-lists.json';

// ---------------------------------------------------------------------------
// Pure helpers — unchanged, exported for unit tests
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Blob I/O helpers
// ---------------------------------------------------------------------------

async function readBlob<T>(pathname: string, fallback: T): Promise<T> {
  const { blobs } = await list({ prefix: pathname, limit: 1 });
  if (blobs.length === 0) return fallback;
  const token = process.env['BLOB_READ_WRITE_TOKEN'] ?? '';
  const res = await fetch(blobs[0].url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  log('DEBUG', 'Blob read HTTP %s [%s]', res.status, pathname);
  if (!res.ok) throw new Error(`Blob read failed: ${res.status} ${res.statusText}`);
  return JSON.parse(await res.text()) as T;
}

async function writeBlob(pathname: string, data: unknown): Promise<void> {
  // Private stores don't reliably support allowOverwrite; delete first
  const { blobs } = await list({ prefix: pathname, limit: 1 });
  if (blobs.length > 0) await del(blobs[0].url);
  await put(pathname, JSON.stringify(data), {
    access: 'private',
    addRandomSuffix: false,
  });
}

// ---------------------------------------------------------------------------
// Seen IDs
// ---------------------------------------------------------------------------

export async function loadSeen(): Promise<Record<string, number>> {
  return readBlob<Record<string, number>>(SEEN_PATH, {});
}

export async function saveSeen(seen: Record<string, number>): Promise<void> {
  await writeBlob(SEEN_PATH, pruneSeen(seen));
}

// ---------------------------------------------------------------------------
// Stop lists
// ---------------------------------------------------------------------------

export async function loadStopLists(): Promise<{ companies: string[]; titles: string[] }> {
  return readBlob(STOP_LISTS_PATH, { companies: [], titles: [] });
}

export async function addToStopList(type: 'company' | 'title', value: string): Promise<void> {
  const current = await loadStopLists();
  const list = type === 'company' ? current.companies : current.titles;
  if (!list.some(s => s.toLowerCase() === value.toLowerCase())) {
    list.push(value);
  }
  await writeBlob(STOP_LISTS_PATH, current);
}

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

export interface ScoreRecord {
  job:       JobResult;
  verdict:   string;
  reasoning: string;
  scoredAt:  string;
}

const SCORES_PREFIX = 'alerts/scores/';

function scoreKey(jobId: string): string {
  return `${SCORES_PREFIX}${jobId.replace(/\//g, '_')}.json`;
}

export async function saveScore(jobId: string, record: ScoreRecord): Promise<void> {
  await writeBlob(scoreKey(jobId), record);
}

export async function loadScore(jobId: string): Promise<ScoreRecord | null> {
  const { blobs } = await list({ prefix: scoreKey(jobId), limit: 1 });
  if (blobs.length === 0) return null;
  const token = process.env['BLOB_READ_WRITE_TOKEN'] ?? '';
  const res = await fetch(blobs[0].url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return JSON.parse(await res.text()) as ScoreRecord;
}

export async function purgeOldScores(ttlMs: number = 3 * 24 * 60 * 60 * 1000): Promise<void> {
  const cutoff = Date.now() - ttlMs;
  let cursor: string | undefined;
  let deleted = 0;

  do {
    const result = await list({ prefix: SCORES_PREFIX, limit: 1000, ...(cursor ? { cursor } : {}) });
    const stale = result.blobs.filter(b => b.uploadedAt.getTime() < cutoff).map(b => b.url);
    if (stale.length > 0) {
      await del(stale);
      deleted += stale.length;
    }
    cursor = result.cursor;
  } while (cursor);

  log('INFO', 'Purged %s stale score blob(s) older than %sd', deleted, Math.round(ttlMs / 86_400_000));
}

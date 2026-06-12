import { Storage } from "@google-cloud/storage";
import { JobResult, SearchResults } from "./linkedin";
import { log } from "./utils/logger";
import { ENV } from "./config/settings";

export const SEEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SEEN_PATH = "alerts/seen.json";
const STOP_LISTS_PATH = "alerts/stop-lists.json";

// ---------------------------------------------------------------------------
// Pure helpers — unchanged, exported for unit tests
// ---------------------------------------------------------------------------

export function filterUnseen(
  results: SearchResults,
  seen: Record<string, number>,
): SearchResults {
  const out: SearchResults = {};
  for (const [id, result] of Object.entries(results)) {
    if (!seen[id]) out[id] = result;
  }
  return out;
}

export function markAsSeen(
  results: SearchResults,
  seen: Record<string, number>,
  now: number = Date.now(),
): Record<string, number> {
  const updated = { ...seen };
  for (const id of Object.keys(results)) {
    updated[id] = now;
  }
  return updated;
}

export function pruneSeen(
  seen: Record<string, number>,
  now: number = Date.now(),
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, ts] of Object.entries(seen)) {
    if (now - ts < SEEN_TTL_MS) out[id] = ts;
  }
  return out;
}

// ---------------------------------------------------------------------------
// GCS helpers
// ---------------------------------------------------------------------------

function getBucket() {
  const bucketName = process.env[ENV.GCS_BUCKET];
  if (!bucketName)
    throw new Error(`Environment variable not set: ${ENV.GCS_BUCKET}`);
  const storage = new Storage();
  return storage.bucket(bucketName);
}

async function readGCS<T>(pathname: string, fallback: T): Promise<T> {
  const file = getBucket().file(pathname);
  const [exists] = await file.exists();
  if (!exists) return fallback;
  const [contents] = await file.download();
  log("DEBUG", "GCS read OK [%s]", pathname);
  return JSON.parse(contents.toString("utf8")) as T;
}

async function writeGCS(pathname: string, data: unknown): Promise<void> {
  const file = getBucket().file(pathname);
  await file.save(JSON.stringify(data), { contentType: "application/json" });
  log("DEBUG", "GCS write OK [%s]", pathname);
}

// ---------------------------------------------------------------------------
// Seen IDs
// ---------------------------------------------------------------------------

export async function loadSeen(): Promise<Record<string, number>> {
  return readGCS<Record<string, number>>(SEEN_PATH, {});
}

export async function saveSeen(seen: Record<string, number>): Promise<void> {
  await writeGCS(SEEN_PATH, pruneSeen(seen));
}

// ---------------------------------------------------------------------------
// Stop lists
// ---------------------------------------------------------------------------

export async function loadStopLists(): Promise<{
  companies: string[];
  titles: string[];
}> {
  return readGCS(STOP_LISTS_PATH, { companies: [], titles: [] });
}

export async function addToStopList(
  type: "company" | "title",
  value: string,
): Promise<void> {
  const current = await loadStopLists();
  const lst = type === "company" ? current.companies : current.titles;
  if (!lst.some((s) => s.toLowerCase() === value.toLowerCase())) {
    lst.push(value);
  }
  await writeGCS(STOP_LISTS_PATH, current);
}

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

export interface ScoreRecord {
  job: JobResult;
  verdict: string;
  reasoning: string;
  scoredAt: string;
}

const SCORES_PREFIX = "alerts/scores/";

function scoreKey(jobId: string): string {
  return `${SCORES_PREFIX}${jobId.replace(/\//g, "_")}.json`;
}

export async function saveScore(
  jobId: string,
  record: ScoreRecord,
): Promise<void> {
  await writeGCS(scoreKey(jobId), record);
}

export async function loadScore(jobId: string): Promise<ScoreRecord | null> {
  const file = getBucket().file(scoreKey(jobId));
  const [exists] = await file.exists();
  if (!exists) return null;
  const [contents] = await file.download();
  return JSON.parse(contents.toString("utf8")) as ScoreRecord;
}

export async function purgeOldScores(
  ttlMs: number = 3 * 24 * 60 * 60 * 1000,
): Promise<void> {
  const cutoff = Date.now() - ttlMs;
  const bucket = getBucket();
  const [files] = await bucket.getFiles({ prefix: SCORES_PREFIX });
  const stale = files.filter((f) => {
    const updated = f.metadata.updated
      ? new Date(f.metadata.updated as string).getTime()
      : 0;
    return updated < cutoff;
  });
  if (stale.length > 0) {
    await Promise.all(stale.map((f) => f.delete()));
  }
  log(
    "INFO",
    "Purged %s stale score blob(s) older than %sd",
    stale.length,
    Math.round(ttlMs / 86_400_000),
  );
}

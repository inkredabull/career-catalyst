import { COMPANY_TARGETS, CompanyTarget } from "../config/boards";
import { timeFrameToCutoffMs } from "../clock";
import { titlePassesPatterns } from "../filters";
import { JobResult, SearchResults } from "../linkedin";
import { log } from "../utils/logger";
import { withConcurrency } from "../utils/concurrency";
import { AtsJob } from "./types";
import { isUsOrBayArea } from "./location";
import { greenhouseUrl, normalizeGreenhouse } from "./greenhouse";
import { leverUrl, normalizeLever } from "./lever";
import { ashbyUrl, normalizeAshby } from "./ashby";

/**
 * Ashby's OpenAI board alone is ~13 MB of JSON. Four of those in flight is
 * already a lot of heap, so keep this well below the number of targets.
 */
const FETCH_CONCURRENCY = 4;

/** Generous enough for the multi-megabyte boards; scoring.ts uses 8s for small pages. */
const FETCH_TIMEOUT_MS = 15_000;

/** Ashby's WAF 403s some clients, so send an explicit, honest UA. */
const USER_AGENT = "career-catalyst-alerts/2.0";

const PROVIDERS = {
  greenhouse: { url: greenhouseUrl, normalize: normalizeGreenhouse },
  lever: { url: leverUrl, normalize: normalizeLever },
  ashby: { url: ashbyUrl, normalize: normalizeAshby },
} as const;

/**
 * Collapse the multiple location-specific copies Greenhouse emits for one
 * requisition, merging their locations into a single comma-joined string.
 */
export function dedupeByRequisition(jobs: AtsJob[]): AtsJob[] {
  const byKey = new Map<string, AtsJob>();
  for (const job of jobs) {
    const existing = byKey.get(job.dedupKey);
    if (!existing) {
      byKey.set(job.dedupKey, { ...job });
      continue;
    }
    if (job.location && !existing.location.includes(job.location)) {
      existing.location = existing.location
        ? `${existing.location}, ${job.location}`
        : job.location;
    }
    // Keep the earliest publish date so freshness reflects the requisition.
    if (job.publishedAtMs && job.publishedAtMs < existing.publishedAtMs) {
      existing.publishedAtMs = job.publishedAtMs;
    }
  }
  return [...byKey.values()];
}

/** Map a normalized ATS job onto the digest's JobResult shape. */
export function atsJobToResult(job: AtsJob, target: CompanyTarget): JobResult {
  return {
    id: job.url,
    company: target.name,
    title: job.title,
    url: job.url,
    // The `Target/{name}` prefix is a contract with notify.ts geoLabel().
    search: `Target/${target.name}`,
    source: target.name,
    ...(job.location ? { location: job.location } : {}),
  };
}

/**
 * Select the jobs from one board that belong in this run's digest.
 *
 * Freshness is checked before the title regexes: the numeric compare discards
 * ~99% of a board, and running ten regexes over several thousand titles per
 * run is the difference between free and noticeable.
 *
 * Jobs with no parseable publish date are dropped — on a digest that runs
 * every few hours, an unknown date is far likelier to be stale than fresh.
 *
 * Location is filtered last, after the requisition merge, so a req offered in
 * both London and San Francisco is judged on its combined location rather than
 * on whichever copy happened to come first.
 */
export function selectFreshJobs(jobs: AtsJob[], cutoffMs: number): AtsJob[] {
  const fresh = jobs.filter(
    (j) => j.publishedAtMs > 0 && j.publishedAtMs >= cutoffMs,
  );
  return dedupeByRequisition(fresh)
    .filter((j) => titlePassesPatterns(j.title))
    .filter((j) => isUsOrBayArea(j.location));
}

async function fetchBoard(target: CompanyTarget): Promise<AtsJob[]> {
  const { url, normalize } = PROVIDERS[target.ats];
  const endpoint = url(target.token);

  const response = await fetch(endpoint, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    log(
      "WARN",
      "ATS HTTP %s [%s/%s]: %s",
      response.status,
      target.ats,
      target.token,
      (await response.text()).slice(0, 200),
    );
    return [];
  }
  return normalize(await response.json());
}

/**
 * Poll every target company's job board directly.
 *
 * Unlike a search API these are free and unmetered, so the cost of watching
 * one more company is zero. Each board is isolated in a try/catch: a dead
 * token, a timeout or a DNS failure costs that company's jobs for the run and
 * nothing else.
 */
export async function fetchAtsResults(
  timeFrame: string,
  targets: CompanyTarget[] = COMPANY_TARGETS,
  now?: number,
): Promise<SearchResults> {
  const cutoffMs = timeFrameToCutoffMs(timeFrame, now);
  const results: SearchResults = {};

  await withConcurrency(targets, FETCH_CONCURRENCY, async (target) => {
    try {
      const jobs = await fetchBoard(target);
      if (jobs.length === 0) {
        // A live board is never empty — this means the token has rotted or the
        // company migrated ATS vendors. Warn so it surfaces in the digest footer.
        log("WARN", "ATS board empty [%s/%s]", target.ats, target.token);
        return;
      }

      const selected = selectFreshJobs(jobs, cutoffMs);
      for (const job of selected) {
        results[job.url] = atsJobToResult(job, target);
      }
      log(
        "DEBUG",
        "ATS %s: %s raw -> %s selected",
        target.name,
        jobs.length,
        selected.length,
      );
    } catch (err) {
      log(
        "WARN",
        "ATS fetch failed [%s/%s]: %s",
        target.ats,
        target.token,
        (err as Error).message,
      );
    }
  });

  log(
    "INFO",
    "ATS: %s jobs from %s boards",
    Object.keys(results).length,
    targets.length,
  );
  return results;
}

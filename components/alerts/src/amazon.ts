import { timeFrameToCutoffMs } from "./clock";
import { SEARCH_TITLES } from "./config/titles";
import { titlePassesPatterns } from "./filters";
import { JobResult, SearchResults } from "./linkedin";
import { log } from "./utils/logger";
import { withConcurrency } from "./utils/concurrency";

const BASE_URL = "https://www.amazon.jobs";
const RESULT_LIMIT = 50;
const FETCH_TIMEOUT_MS = 15_000;
const FETCH_CONCURRENCY = 2;
const USER_AGENT = "career-catalyst-alerts/2.0";

export interface AmazonJob {
  id_icims: string;
  title: string;
  job_path: string;
  posted_date?: string;
  normalized_location?: string;
  location?: string;
}

interface AmazonResponse {
  jobs?: AmazonJob[];
}

/** Amazon's careers site backs its search page with this unauthenticated JSON endpoint. */
export function buildAmazonUrl(title: string): string {
  const params = new URLSearchParams({
    base_query: title,
    country: "USA",
    sort: "recent",
    result_limit: String(RESULT_LIMIT),
    offset: "0",
  });
  return `${BASE_URL}/en/search.json?${params.toString()}`;
}

export function amazonJobToResult(job: AmazonJob): JobResult {
  const url = `${BASE_URL}${job.job_path}`;
  const location = job.normalized_location ?? job.location;
  return {
    id: url,
    company: "Amazon",
    title: job.title,
    url,
    // ", US" routes this to Remote US in notify.ts geoLabel().
    search: "Amazon, US",
    source: "Amazon",
    ...(location ? { location } : {}),
  };
}

/** posted_date looks like "September 23, 2026"; anything unparseable is dropped as stale. */
export function isFreshAmazonJob(job: AmazonJob, cutoffMs: number): boolean {
  if (!job.posted_date) return false;
  const postedMs = Date.parse(`${job.posted_date} 23:59:59`);
  return !Number.isNaN(postedMs) && postedMs >= cutoffMs;
}

/**
 * Search Amazon's job board once per active title.
 *
 * Every failure is contained: a bad response costs that query's jobs for the
 * run and nothing else, so this can never take down the digest.
 */
export async function fetchAmazonResults(
  timeFrame: string,
  now?: number,
): Promise<SearchResults> {
  const cutoffMs = timeFrameToCutoffMs(timeFrame, now);
  const titles = Object.entries(SEARCH_TITLES)
    .filter(([, enabled]) => enabled)
    .map(([title]) => title);

  const results: SearchResults = {};
  let rawCount = 0;

  await withConcurrency(titles, FETCH_CONCURRENCY, async (title) => {
    try {
      const response = await fetch(buildAmazonUrl(title), {
        headers: { accept: "application/json", "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        log("WARN", "Amazon HTTP %s [%s]", response.status, title);
        return;
      }
      const jobs = ((await response.json()) as AmazonResponse).jobs ?? [];
      rawCount += jobs.length;
      for (const job of jobs) {
        if (!isFreshAmazonJob(job, cutoffMs)) continue;
        if (!titlePassesPatterns(job.title)) continue;
        const result = amazonJobToResult(job);
        results[result.id] = result;
      }
    } catch (err) {
      log(
        "WARN",
        "Amazon fetch failed [%s]: %s",
        title,
        (err as Error).message,
      );
    }
  });

  log(
    "INFO",
    "Amazon: %s jobs from %s raw across %s queries",
    Object.keys(results).length,
    rawCount,
    titles.length,
  );
  return results;
}

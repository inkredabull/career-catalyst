import { ENV } from "./config/settings";
import { timeFrameToCutoffMs, timeFrameToSeconds } from "./clock";
import { titlePassesPatterns } from "./filters";
import { SearchResults, JobResult } from "./linkedin";
import { log } from "./utils/logger";

const SEARCH_URL = "https://data.usajobs.gov/api/Search";
const RESULTS_PER_PAGE = 500;
const MAX_PAGES = 3;
const MAX_DATE_POSTED_DAYS = 60;
const FETCH_TIMEOUT_MS = 15_000;

interface MatchedObjectDescriptor {
  PositionTitle: string;
  PositionURI: string;
  OrganizationName: string;
  PositionLocationDisplay?: string;
  PublicationStartDate?: string;
}

interface SearchResultItem {
  MatchedObjectDescriptor: MatchedObjectDescriptor;
}

interface UsajobsResponse {
  SearchResult?: {
    SearchResultItems?: SearchResultItem[];
    SearchResultCountAll?: number;
  };
}

/**
 * Ask the API for only the window we care about, newest first. Without
 * DatePosted and a sort the first 500 rows are an arbitrary slice of every
 * open federal posting, and fresh ones mostly fall outside it.
 */
export function buildSearchUrl(timeFrame: string, page: number): string {
  const days = Math.min(
    MAX_DATE_POSTED_DAYS,
    Math.max(1, Math.ceil(timeFrameToSeconds(timeFrame) / 86_400)),
  );
  const params = new URLSearchParams({
    ResultsPerPage: String(RESULTS_PER_PAGE),
    Page: String(page),
    DatePosted: String(days),
    SortField: "opendate",
    SortDirection: "desc",
  });
  return `${SEARCH_URL}?${params.toString()}`;
}

/** Map a raw USAJOBS search hit onto the digest's JobResult shape. */
export function usajobsItemToResult(item: SearchResultItem): JobResult {
  const d = item.MatchedObjectDescriptor;
  return {
    id: d.PositionURI,
    company: d.OrganizationName,
    title: d.PositionTitle,
    url: d.PositionURI,
    // Contract with notify.ts geoLabel().
    search: "USAJOBS",
    source: "USAJOBS",
    ...(d.PositionLocationDisplay
      ? { location: d.PositionLocationDisplay }
      : {}),
  };
}

function isFresh(item: SearchResultItem, cutoffMs: number): boolean {
  const raw = item.MatchedObjectDescriptor.PublicationStartDate;
  if (!raw) return false;
  const publishedAtMs = Date.parse(raw);
  return !Number.isNaN(publishedAtMs) && publishedAtMs >= cutoffMs;
}

/**
 * Poll the USAJOBS Search API.
 *
 * Degrades rather than throws if credentials are unset — getResults() calls
 * this inline, so a missing key would otherwise take down the whole digest,
 * including the free ATS and LinkedIn sources that need nothing from here.
 */
export async function fetchUsajobsResults(
  timeFrame: string,
  now?: number,
): Promise<SearchResults> {
  const apiKey = process.env[ENV.USAJOBS_API_KEY];
  const userAgent = process.env[ENV.USAJOBS_USER_AGENT];
  if (!apiKey || !userAgent) {
    log(
      "WARN",
      "%s/%s not set — skipping USAJOBS",
      ENV.USAJOBS_API_KEY,
      ENV.USAJOBS_USER_AGENT,
    );
    return {};
  }

  const cutoffMs = timeFrameToCutoffMs(timeFrame, now);
  const headers = {
    Host: "data.usajobs.gov",
    "User-Agent": userAgent,
    "Authorization-Key": apiKey,
  };

  const results: SearchResults = {};
  let rawCount = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    let body: UsajobsResponse;
    try {
      const response = await fetch(buildSearchUrl(timeFrame, page), {
        headers,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        log(
          "WARN",
          "USAJOBS HTTP %s: %s",
          response.status,
          (await response.text()).slice(0, 200),
        );
        break;
      }
      body = (await response.json()) as UsajobsResponse;
    } catch (err) {
      log("WARN", "USAJOBS fetch failed: %s", (err as Error).message);
      break;
    }

    const items = body.SearchResult?.SearchResultItems ?? [];
    rawCount += items.length;
    for (const item of items) {
      if (!isFresh(item, cutoffMs)) continue;
      if (!titlePassesPatterns(item.MatchedObjectDescriptor.PositionTitle))
        continue;
      const result = usajobsItemToResult(item);
      results[result.id] = result;
    }

    const total = body.SearchResult?.SearchResultCountAll ?? 0;
    if (items.length === 0 || rawCount >= total) break;
  }

  log(
    "INFO",
    "USAJOBS: %s jobs from %s raw",
    Object.keys(results).length,
    rawCount,
  );
  return results;
}

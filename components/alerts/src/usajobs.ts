import { ENV } from "./config/settings";
import { timeFrameToCutoffMs } from "./clock";
import { titlePassesPatterns } from "./filters";
import { SearchResults, JobResult } from "./linkedin";
import { log } from "./utils/logger";

const SEARCH_URL = "https://data.usajobs.gov/api/Search";
const RESULTS_PER_PAGE = 500;
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
  const url = `${SEARCH_URL}?ResultsPerPage=${RESULTS_PER_PAGE}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Host: "data.usajobs.gov",
        "User-Agent": userAgent,
        "Authorization-Key": apiKey,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    log("WARN", "USAJOBS fetch failed: %s", (err as Error).message);
    return {};
  }

  if (!response.ok) {
    log(
      "WARN",
      "USAJOBS HTTP %s: %s",
      response.status,
      (await response.text()).slice(0, 200),
    );
    return {};
  }

  const body = (await response.json()) as UsajobsResponse;
  const items = body.SearchResult?.SearchResultItems ?? [];

  const results: SearchResults = {};
  for (const item of items) {
    if (!isFresh(item, cutoffMs)) continue;
    if (!titlePassesPatterns(item.MatchedObjectDescriptor.PositionTitle))
      continue;
    const result = usajobsItemToResult(item);
    results[result.id] = result;
  }

  log(
    "INFO",
    "USAJOBS: %s jobs from %s raw",
    Object.keys(results).length,
    items.length,
  );
  return results;
}

import { requireEnv, ENV } from "./config/settings";
import { SEARCH_TITLES } from "./config/titles";
import { titlePassesPatterns } from "./filters";
import { SearchResults } from "./linkedin";
import { log } from "./utils/logger";
import { normalizeWhitespace } from "./utils/text";
import { withConcurrency } from "./utils/concurrency";

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Builds the search query.
 *
 * Plain language, not Google operator syntax: Exa's index is semantic, and the
 * old `("Title A" OR "Title B")` clause measurably hurt it — the quoted-OR form
 * surfaced "Regional Vice President, Sales" and "VP of Talent", while the same
 * search phrased naturally returned on-target titles throughout.
 */
export function buildDiscoveryQuery(
  titles: string[],
  locationHint?: string,
): string {
  const roles = titles.join(", ");
  const where = locationHint ? ` in ${locationHint}` : "";
  return `${roles} job opening${where}`;
}

const NOISE_SEGMENTS = new Set([
  "jobs",
  "ashby",
  "wellfound",
  "linkedin",
  "indeed",
  "glassdoor",
  "greenhouse",
  "lever",
  "builtin",
  "levels",
  "levels.fyi",
  "y combinator",
]);

/** Trailing site-name noise that follows a dash rather than a pipe. */
const TRAILING_NOISE = /\s*[-–—|]\s*(jobs?|careers?|job\s+board)\s*$/i;

/** Greenhouse application pages title themselves "Job Application for X at Y". */
const APPLICATION_PREFIX = /^job\s+application\s+for\s+/i;

/**
 * Parses a raw search-result page title into job title + company.
 *
 * Handles the formats the discovery sources actually emit:
 *   "Head of Engineering @ Notion | Jobs"                     (Ashby @ format)
 *   "VP Engineering at Stripe | Ashby"
 *   "CTO at Postal | Y Combinator"                            (YC)
 *   "VP of Engineering | Qdrant | Levels.fyi"                 (segment fallback)
 *   "VP of Engineering - Heliux | Built In San Francisco"     (BuiltIn)
 *   "VP of Engineering at Feathr • Gainesville | Wellfound"   (bullet metadata)
 *   "Arlo Hotels hiring Director of Engineering in Seattle"   (LinkedIn alert)
 *   "Fig - VP, Head of Engineering"                           (Lever, companyFirst)
 *
 * `companyFirst` inverts the dash format. Lever's SEO titles are
 * "{Company} - {Title}", the opposite of everyone else's, so without it every
 * Lever result parses to a company name as its title, fails the title filter,
 * and the whole slot silently returns nothing.
 */
export function parseResultTitle(
  raw: string,
  opts?: { companyFirst?: boolean },
): {
  title: string;
  company: string;
} {
  const cleaned = normalizeWhitespace(raw).replace(APPLICATION_PREFIX, "");
  const segments = cleaned.split(" | ").map((s) => s.trim());
  const withoutSite =
    segments.find((s) => !NOISE_SEGMENTS.has(s.toLowerCase())) ?? segments[0];
  const trimmed = withoutSite.replace(TRAILING_NOISE, "");

  const atSignMatch = trimmed.match(/^(.+?)\s*@\s*(.+)$/);
  if (atSignMatch)
    return {
      title: atSignMatch[1].trim(),
      company: cleanCompany(atSignMatch[2]),
    };

  const atWordMatch = trimmed.match(/^(.+?)\s+at\s+(.+)$/i);
  if (atWordMatch)
    return {
      title: atWordMatch[1].trim(),
      company: cleanCompany(atWordMatch[2]),
    };

  const hiringMatch = trimmed.match(/^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+.+)?$/i);
  if (hiringMatch)
    return {
      title: hiringMatch[2].trim(),
      company: cleanCompany(hiringMatch[1]),
    };

  const dashMatch = trimmed.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dashMatch) {
    const [, first, second] = dashMatch;
    return opts?.companyFirst
      ? { title: second.trim(), company: cleanCompany(first) }
      : { title: first.trim(), company: cleanCompany(second) };
  }

  // Fallback: use other non-noise segments, stripping "Careers" / "Job Board" suffixes
  const others = segments.filter(
    (s) => s !== withoutSite && !NOISE_SEGMENTS.has(s.toLowerCase()),
  );
  if (others.length > 0) {
    const company = cleanCompany(others[others.length - 1]);
    if (company) return { title: trimmed, company };
  }

  return { title: trimmed, company: "" };
}

/**
 * Trims the trailing metadata sites hang off a company name.
 *
 * Wellfound appends bullet-separated locations ("Feathr • Gainesville •
 * Remote (Work from Home)"), and several sites append their own name.
 */
function cleanCompany(raw: string): string {
  return raw
    .split("•")[0]
    .replace(TRAILING_NOISE, "")
    .replace(/\s+(careers?|job\s+board)\s*$/i, "")
    .trim();
}

/**
 * True when a URL's path starts with one of `prefixes`.
 *
 * Exa filters by domain only, so slots that used a path-scoped `site:` need
 * this to avoid pulling in the rest of the site. Get the prefix wrong and the
 * slot silently returns nothing — BuiltIn uses `/job/` singular, and Levels.fyi
 * puts the id in a query string (`/jobs?jobId=...`), so neither tolerates the
 * `/jobs/` you would guess.
 */
export function passesPathFilter(url: string, prefixes?: string[]): boolean {
  if (!prefixes || prefixes.length === 0) return true;
  try {
    const { pathname } = new URL(url);
    return prefixes.some((p) => pathname.startsWith(p));
  } catch {
    return false;
  }
}

/**
 * Discovery runs on every third cron tick (UTC 0, 8, 16) rather than all six.
 *
 * Exa is metered and the ATS layer is not, so the free monthly credit is spent
 * on the thing that actually needs a search engine: finding companies not yet
 * in COMPANY_TARGETS. A new company surfacing 8 hours later instead of 4 costs
 * nothing in practice — seen.ts dedupes, so nothing is missed, only delayed.
 */
export function shouldRunDiscovery(now: Date = new Date()): boolean {
  return now.getUTCHours() % 8 === 0;
}

// ---------------------------------------------------------------------------
// Search slots
// ---------------------------------------------------------------------------

// Watching a specific company no longer happens here — see src/config/boards.ts,
// which polls the company's ATS directly for free rather than spending a search
// credit per company per run.

interface DiscoverySearch {
  /** Must route to the intended email section via notify.ts geoLabel(). */
  label: string;
  source: string;
  locationHint?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  /** URL path prefixes to keep, for slots that used a path-scoped site: query. */
  pathPrefixes?: string[];
  /** Lever inverts title and company in its page titles. */
  companyFirst?: boolean;
}

const DISCOVERY_SEARCHES: DiscoverySearch[] = [
  {
    label: "Ashby/SF",
    source: "Ashby",
    locationHint: "San Francisco",
    includeDomains: ["jobs.ashbyhq.com"],
  },
  {
    // "Web/US" would route to Other: lowercased it contains "/us", and
    // geoLabel() looks for ", us".
    label: "Web, US",
    source: "Google",
    locationHint: "the United States, remote",
    excludeDomains: [
      "reddit.com",
      "news.ycombinator.com",
      "medium.com",
      "substack.com",
    ],
  },
  {
    label: "Wellfound/SF",
    source: "Wellfound",
    locationHint: "San Francisco",
    includeDomains: ["wellfound.com"],
  },
  {
    // Greenhouse migrated to job-boards.*; the old site:boards.greenhouse.io
    // was only matching the legacy host.
    label: "Greenhouse/US",
    source: "Greenhouse",
    includeDomains: ["job-boards.greenhouse.io", "boards.greenhouse.io"],
  },
  {
    label: "Lever/US",
    source: "Lever",
    includeDomains: ["jobs.lever.co"],
    companyFirst: true,
  },
  {
    label: "BuiltInSF/SF",
    source: "BuiltInSF",
    locationHint: "San Francisco",
    includeDomains: ["builtinsf.com"],
    pathPrefixes: ["/job/"],
  },
  {
    label: "Levels/US",
    source: "Levels.fyi",
    includeDomains: ["levels.fyi"],
    pathPrefixes: ["/jobs"],
  },
  {
    // includeDomains matches subdomains, so Hacker News threads leak in through
    // ycombinator.com and parse into garbage. Excluded twice, deliberately.
    label: "YC/US",
    source: "Y Combinator",
    includeDomains: ["ycombinator.com"],
    excludeDomains: ["news.ycombinator.com"],
    pathPrefixes: ["/companies/"],
  },
];

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/** Cost is flat up to ~10 results, then ~$0.0009 each — 10 costs the same as 5. */
const NUM_RESULTS = 10;

/**
 * Hard stop for one run's Exa spend. Serper died by silently exhausting its
 * credits; this makes that failure mode loud and bounded instead.
 * Eight slots cost ~$0.056, so this leaves headroom without being a blank cheque.
 */
const RUN_COST_CEILING_USD = 0.1;

const FETCH_TIMEOUT_MS = 10_000;

interface ExaResult {
  title?: string | null;
  url?: string;
}

interface ExaResponse {
  results?: ExaResult[];
  costDollars?: { total?: number };
  error?: string;
}

export function buildExaBody(
  search: DiscoverySearch,
  query: string,
): Record<string, unknown> {
  return {
    query,
    numResults: NUM_RESULTS,
    ...(search.includeDomains ? { includeDomains: search.includeDomains } : {}),
    ...(search.excludeDomains ? { excludeDomains: search.excludeDomains } : {}),
    // Deliberately absent:
    //   contents            — costs extra credits; title + url is all we use.
    //   startPublishedDate  — Exa returns crawl-derived dates when it is set
    //                         (several clamped to exactly the boundary value)
    //                         and relevance drops sharply. Freshness is already
    //                         enforced honestly by seen.ts + filterUnseen.
  };
}

export async function fetchDiscoveryResults(): Promise<SearchResults> {
  const apiKey = requireEnv(ENV.EXA_API_KEY);
  const enabledTitles = Object.entries(SEARCH_TITLES)
    .filter(([, enabled]) => enabled)
    .map(([title]) => title);

  const results: SearchResults = {};
  let spentUsd = 0;

  await withConcurrency(DISCOVERY_SEARCHES, 3, async (search) => {
    if (spentUsd >= RUN_COST_CEILING_USD) {
      log(
        "WARN",
        "Exa cost ceiling $%s reached — skipping [%s]",
        RUN_COST_CEILING_USD,
        search.label,
      );
      return;
    }

    const query = buildDiscoveryQuery(enabledTitles, search.locationHint);
    log("DEBUG", "Exa search: %s — %s", search.label, query);

    try {
      const response = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: { "x-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify(buildExaBody(search, query)),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        log(
          "WARN",
          "Exa HTTP %s [%s]: %s",
          response.status,
          search.label,
          (await response.text()).slice(0, 200),
        );
        return;
      }

      const data = (await response.json()) as ExaResponse;
      spentUsd += data.costDollars?.total ?? 0;
      if (data.error) {
        log("WARN", "Exa error [%s]: %s", search.label, data.error);
        return;
      }

      let found = 0;
      let filteredByPath = 0;
      for (const item of data.results ?? []) {
        if (!item.url || !item.title) continue;
        if (!passesPathFilter(item.url, search.pathPrefixes)) {
          filteredByPath++;
          continue;
        }

        const { title, company } = parseResultTitle(item.title, {
          ...(search.companyFirst ? { companyFirst: true } : {}),
        });
        if (!titlePassesPatterns(title)) {
          log("DEBUG", "Filtered (patterns): %s", item.title);
          continue;
        }

        results[item.url] = {
          id: item.url,
          company,
          title,
          url: item.url,
          search: search.label,
          source: search.source,
        };
        found++;
      }

      log(
        "DEBUG",
        "Exa %s: %s/%s passed (%s dropped by path)",
        search.label,
        found,
        (data.results ?? []).length,
        filteredByPath,
      );
    } catch (err) {
      log(
        "WARN",
        "Exa fetch failed [%s]: %s",
        search.label,
        (err as Error).message,
      );
    }
  });

  log(
    "INFO",
    "Discovery: %s jobs from %s slots ($%s)",
    Object.keys(results).length,
    DISCOVERY_SEARCHES.length,
    spentUsd.toFixed(4),
  );
  return results;
}

import { requireEnv, ENV } from "./config/settings";
import { SEARCH_TITLES } from "./config/titles";
import { titlePassesPatterns } from "./filters";
import { SearchResults } from "./linkedin";
import { log } from "./utils/logger";

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit tests
// ---------------------------------------------------------------------------

/** Converts a LinkedIn-style time-frame string (e.g. "r86400") to a YYYY-MM-DD
 *  date string suitable for the Google `after:` search operator. */
export function timeFrameToAfterDate(timeFrame: string): string {
  const seconds = parseInt(timeFrame.replace("r", ""), 10);
  const d = new Date(Date.now() - seconds * 1000);
  return d.toISOString().split("T")[0];
}

/** Builds the `("Title A" OR "Title B" OR ...)` clause from an array of titles. */
export function buildTitleClause(titles: string[]): string {
  return `(${titles.map((t) => `"${t}"`).join(" OR ")})`;
}

const NOISE_SEGMENTS = new Set([
  "jobs",
  "ashby",
  "wellfound",
  "linkedin",
  "indeed",
  "glassdoor",
  "levels",
  "builtin",
]);

/** Parses a raw Google/Serper result title into job title + company.
 *  Handles common formats:
 *    "Head of Engineering @ Notion | Jobs"                     (Ashby @ format)
 *    "Jobs | Chief of Staff @ Superpower"                      (Jobs prefix noise)
 *    "VP Engineering at Stripe | Ashby"
 *    "Arlo Hotels hiring Director of Engineering in Seattle"   (LinkedIn alert format)
 *    "Head of Engineering - Acme | Wellfound"
 *    "CTO – Some Company"
 *    "Senior FDE, Cloud AI | Google Careers"                   (segment fallback)  */
export function parseResultTitle(raw: string): {
  title: string;
  company: string;
} {
  const segments = raw.split(" | ").map((s) => s.trim());
  const withoutSite =
    segments.find((s) => !NOISE_SEGMENTS.has(s.toLowerCase())) ?? segments[0];

  const atSignMatch = withoutSite.match(/^(.+?)\s*@\s*(.+)$/);
  if (atSignMatch)
    return { title: atSignMatch[1].trim(), company: atSignMatch[2].trim() };

  const atWordMatch = withoutSite.match(/^(.+?)\s+at\s+(.+)$/i);
  if (atWordMatch)
    return { title: atWordMatch[1].trim(), company: atWordMatch[2].trim() };

  const hiringMatch = withoutSite.match(
    /^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+.+)?$/i,
  );
  if (hiringMatch)
    return { title: hiringMatch[2].trim(), company: hiringMatch[1].trim() };

  const dashMatch = withoutSite.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dashMatch)
    return { title: dashMatch[1].trim(), company: dashMatch[2].trim() };

  // Fallback: use other non-noise segments, stripping "Careers" / "Job Board" suffixes
  const others = segments.filter(
    (s) => s !== withoutSite && !NOISE_SEGMENTS.has(s.toLowerCase()),
  );
  if (others.length > 0) {
    const company = others[others.length - 1]
      .replace(/\s+(careers?|job\s+board)\s*$/i, "")
      .trim();
    if (company) return { title: withoutSite, company };
  }

  return { title: withoutSite, company: "" };
}

// ---------------------------------------------------------------------------
// Search templates
// ---------------------------------------------------------------------------

interface GoogleSearch {
  label: string;
  source: string;
  prefix?: string;
  suffix?: string;
}

const GOOGLE_SEARCHES: GoogleSearch[] = [
  {
    label: "Ashby/SF",
    source: "Ashby",
    prefix: 'site:jobs.ashbyhq.com ("San Francisco")',
    suffix:
      '(apply OR "job description" OR "role" OR responsibilities) -"new grad" -"intern"',
  },
  {
    label: "Web/US",
    source: "Google",
    suffix:
      '(apply OR "job description" OR "role" OR responsibilities) -"new grad" -"intern"' +
      " -site:reddit.com -site:news.ycombinator.com -site:medium.com -site:substack.com",
  },
  {
    label: "Wellfound/SF",
    source: "Wellfound",
    prefix: 'site:wellfound.com ("San Francisco")',
    suffix:
      '(apply OR "job description" OR "role" OR responsibilities) -"new grad" -"intern"',
  },
  {
    label: "Indeed/SF",
    source: "Indeed",
    prefix: 'site:indeed.com ("San Francisco" OR "SF Bay Area" OR Remote)',
    suffix: '-"new grad" -"intern"',
  },
  {
    label: "Anthropic/SF",
    source: "Anthropic",
    prefix: "site:anthropic.com/jobs",
    suffix: '-"new grad" -"intern"',
  },
  {
    label: "Levels/US",
    source: "Levels.fyi",
    prefix: "site:levels.fyi/jobs",
    suffix: '-"new grad" -"intern"',
  },
  {
    label: "BuiltIn/US",
    source: "BuiltIn",
    prefix: "site:builtin.com/jobs",
    suffix: '-"new grad" -"intern"',
  },
];

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

interface SerperItem {
  title: string;
  link: string;
  snippet?: string;
}

interface SerperResponse {
  organic?: SerperItem[];
  error?: string;
}

export async function fetchGoogleResults(
  timeFrame: string,
): Promise<SearchResults> {
  const apiKey = requireEnv(ENV.SERPER_API_KEY);
  const afterDate = timeFrameToAfterDate(timeFrame);

  const enabledTitles = Object.entries(SEARCH_TITLES)
    .filter(([, enabled]) => enabled)
    .map(([title]) => title);
  const titleClause = buildTitleClause(enabledTitles);

  const results: SearchResults = {};

  for (const { label, source, prefix, suffix } of GOOGLE_SEARCHES) {
    const parts = [prefix, titleClause, suffix, `after:${afterDate}`].filter(
      Boolean,
    );
    const query = parts.join(" ");

    log("DEBUG", "Google search: %s (after %s)", label, afterDate);
    log("DEBUG", "Query: %s", query);

    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: 10, gl: "us" }),
    });
    log("DEBUG", "Serper HTTP %s [%s]", response.status, label);
    if (!response.ok) {
      log(
        "WARN",
        "Serper HTTP %s [%s]: %s",
        response.status,
        label,
        (await response.text()).slice(0, 200),
      );
      continue;
    }
    const data = JSON.parse(await response.text()) as SerperResponse;

    if (data.error) {
      log("WARN", "Serper error [%s]: %s", label, data.error);
      continue;
    }

    let found = 0;
    for (const item of data.organic ?? []) {
      const { title, company } = parseResultTitle(item.title);
      if (!titlePassesPatterns(title)) {
        log("DEBUG", "Filtered (patterns): %s", item.title);
        continue;
      }

      results[item.link] = {
        id: item.link,
        company,
        title,
        url: item.link,
        search: label,
        source,
      };
      found++;
    }

    log(
      "DEBUG",
      "Google %s: %s/%s results passed filter",
      label,
      found,
      (data.organic ?? []).length,
    );
  }

  return results;
}

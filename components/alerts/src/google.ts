import { requireProp, SCRIPT_PROPS } from './config/settings';
import { SEARCH_TITLES } from './config/titles';
import { titlePassesPatterns } from './filters';
import { SearchResults } from './linkedin';

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit tests
// ---------------------------------------------------------------------------

/** Converts a LinkedIn-style time-frame string (e.g. "r86400") to a YYYY-MM-DD
 *  date string suitable for the Google `after:` search operator. */
export function timeFrameToAfterDate(timeFrame: string): string {
  const seconds = parseInt(timeFrame.replace('r', ''), 10);
  const d = new Date(Date.now() - seconds * 1000);
  return d.toISOString().split('T')[0];
}

/** Builds the `("Title A" OR "Title B" OR ...)` clause from an array of titles. */
export function buildTitleClause(titles: string[]): string {
  return `(${titles.map(t => `"${t}"`).join(' OR ')})`;
}

/** Parses a raw Google result title into job title + company.
 *  Handles common formats:
 *    "VP Engineering at Stripe | Ashby"
 *    "Head of Engineering - Acme | Wellfound"
 *    "CTO – Some Company"  */
export function parseResultTitle(raw: string): { title: string; company: string } {
  const withoutSite = raw.split(' | ')[0].trim();
  const atMatch = withoutSite.match(/^(.+?)\s+at\s+(.+)$/i);
  if (atMatch) return { title: atMatch[1].trim(), company: atMatch[2].trim() };
  const dashMatch = withoutSite.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dashMatch) return { title: dashMatch[1].trim(), company: dashMatch[2].trim() };
  return { title: withoutSite, company: '' };
}

// ---------------------------------------------------------------------------
// Search templates
// ---------------------------------------------------------------------------

interface GoogleSearch {
  label:   string;
  source:  string;  // shown as "Source: X" in the email
  prefix?: string;  // site: restriction and/or location term
  suffix?: string;  // intent + exclusion terms
}

const GOOGLE_SEARCHES: GoogleSearch[] = [
  {
    label:  'Ashby/SF',
    source: 'Ashby',
    prefix: 'site:jobs.ashbyhq.com ("San Francisco")',
    suffix: '(apply OR "job description" OR "role" OR responsibilities) -"new grad" -"intern"',
  },
  {
    label:  'Web/US',
    source: 'Google',
    suffix: '-"new grad" -"intern"',
  },
  {
    label:  'Wellfound/SF',
    source: 'Wellfound',
    prefix: 'site:wellfound.com ("San Francisco")',
    suffix: '(apply OR "job description" OR "role" OR responsibilities) -"new grad" -"intern"',
  },
];

// ---------------------------------------------------------------------------
// GAS-dependent fetch
// ---------------------------------------------------------------------------

interface CseItem {
  title:    string;
  link:     string;
  snippet?: string;
}

interface CseResponse {
  items?: CseItem[];
  error?: { message: string; code: number };
}

export function fetchGoogleResults(timeFrame: string): SearchResults {
  const apiKey    = requireProp(SCRIPT_PROPS.GOOGLE_API_KEY);
  const cseId     = requireProp(SCRIPT_PROPS.GOOGLE_CSE_ID);
  const afterDate = timeFrameToAfterDate(timeFrame);

  const enabledTitles = Object.entries(SEARCH_TITLES)
    .filter(([, enabled]) => enabled)
    .map(([title]) => title);
  const titleClause = buildTitleClause(enabledTitles);

  const results: SearchResults = {};

  GOOGLE_SEARCHES.forEach(({ label, source, prefix, suffix }) => {
    const parts = [prefix, titleClause, suffix, `after:${afterDate}`].filter(Boolean);
    const query = parts.join(' ');
    const url   = 'https://customsearch.googleapis.com/customsearch/v1?'
      + `key=${encodeURIComponent(apiKey)}`
      + `&cx=${encodeURIComponent(cseId)}`
      + `&q=${encodeURIComponent(query)}`
      + '&num=10';

    console.log('Google search: %s (after %s)', label, afterDate);
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data     = JSON.parse(response.getContentText()) as CseResponse;

    if (data.error) {
      console.log('Google CSE error [%s]: %s', label, data.error.message);
      return;
    }

    let found = 0;
    (data.items ?? []).forEach(item => {
      const { title, company } = parseResultTitle(item.title);
      if (!titlePassesPatterns(title)) return;

      results[item.link] = {
        id:      item.link,
        company,
        title,
        url:     item.link,
        search:  label,
        source,
      };
      found++;
    });

    console.log('Google %s: %s/%s results passed filter', label, found, (data.items ?? []).length);
  });

  return results;
}

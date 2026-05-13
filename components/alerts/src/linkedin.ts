import { requireProp, SCRIPT_PROPS } from './config/settings';
import { GEOS } from './config/constants';
import { titlePassesPatterns } from './filters';
import { log } from './utils/logger';

export interface SearchFilter {
  origin: string;
  keywords?: string;
  locationUnion: { geoId: string };
  selectedFilters: Record<string, (string | number)[]>;
  spellCorrectionEnabled: boolean;
}

export interface JobResult {
  id:       string;
  company:  string;
  title:    string;
  location?: string;
  info?:    string;
  url:      string;
  search:   string;
  source?:  string;
}

export type SearchResults = Record<string, JobResult>;


function buildLiOptions(cookie: string, csrfToken: string, referer: string): GoogleAppsScript.URL_Fetch.URLFetchRequestOptions {
  return {
    method: 'get',
    headers: {
      'accept': 'application/vnd.linkedin.normalized+json+2.1',
      'accept-language': 'en-US,en;q=0.9',
      'csrf-token': csrfToken,
      'x-li-lang': 'en_US',
      'x-restli-protocol-version': '2.0.0',
      'cookie': cookie,
      'Referer': referer,
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
    muteHttpExceptions: true,
    contentType: 'application/json',
  };
}

export function getLinkedinURL(filter: SearchFilter): string {
  const baseUrl = 'https://www.linkedin.com/voyager/api/voyagerJobsDashJobCards';
  const decorationId = 'com.linkedin.voyager.dash.deco.jobs.search.JobSearchCardsCollection-216';

  const queryParts = [
    `origin:${filter.origin}`,
    `keywords:${filter.keywords ?? ''}`,
    `locationUnion:(geoId:${filter.locationUnion.geoId})`,
    `selectedFilters:(${Object.entries(filter.selectedFilters)
      .map(([key, value]) => `${key}:List(${value.join(',')})`)
      .join(',')})`,
    `spellCorrectionEnabled:${filter.spellCorrectionEnabled}`,
  ];

  return `${baseUrl}?decorationId=${decorationId}&count=25&q=jobSearch&query=(${queryParts.join(',')})&start=0`;
}

/** Scans a LinkedIn jobInsightsV2ResolutionResults blob for applicant count.
 *  Returns the count, treating "200+" as 201 so "> 200" comparisons work cleanly. */
export function extractApplicantCount(insights: unknown): number | undefined {
  if (!insights) return undefined;
  const text = JSON.stringify(insights);
  const match = text.match(/(\d[\d,]*)(\+)?\s*applicants?/i);
  if (!match) return undefined;
  const n = parseInt(match[1].replace(/,/g, ''), 10);
  return match[2] ? n + 1 : n;
}

export function extractInfo(data: GoogleAppsScript.Content.TextOutput | Record<string, unknown>, search: string, source?: string): SearchResults {
  const hashOfResults: SearchResults = {};
  const included = (data as Record<string, unknown[]>).included;

  if (Array.isArray(included)) {
    let jobCards = 0, noTitle = 0, patternFiltered = 0, applicantFiltered = 0;

    included.forEach((raw: unknown) => {
      const item = raw as Record<string, unknown>;
      const urn = item.entityUrn as string | undefined;
      if (!urn?.toLowerCase().includes('jobposting')) return;
      jobCards++;

      const id = urn.match(/\d+/)?.[0];
      if (!id) return;

      const titleRaw = item.title;
      const title = typeof titleRaw === 'string'
        ? titleRaw
        : (titleRaw as { text?: string } | undefined)?.text;
      if (!title) { noTitle++; return; }
      if (!titlePassesPatterns(title)) { patternFiltered++; return; }

      const applicants = extractApplicantCount(item.jobInsightsV2ResolutionResults);
      if (applicants !== undefined && applicants > 200) {
        log('DEBUG', 'Excluded (>200 applicants: %s): [%s] %s', applicants, search, title);
        applicantFiltered++;
        return;
      }

      const company  = (item.primaryDescription   as { text?: string } | undefined)?.text ?? '';
      const location = (item.secondaryDescription as { text?: string } | undefined)?.text;
      const info     = (item.tertiaryDescription  as { text?: string } | undefined)?.text;

      hashOfResults[id] = {
        id,
        company,
        title,
        ...(location ? { location } : {}),
        ...(info     ? { info }     : {}),
        ...(source   ? { source }   : {}),
        url: `https://www.linkedin.com/jobs/view/${id}`,
        search,
      };
    });

    const kept = Object.keys(hashOfResults).length;
    log('INFO',  'Result count: %s', kept);
    log('DEBUG', '[%s] %s included → %s job cards → %s titled → %s passed patterns → %s passed applicant filter → %s kept',
      search, included.length, jobCards, jobCards - noTitle,
      jobCards - noTitle - patternFiltered,
      jobCards - noTitle - patternFiltered - applicantFiltered, kept);
  }

  return hashOfResults;
}

export function getSearchResultsFromLinkedin(filter: SearchFilter): Record<string, unknown> {
  const cookie    = requireProp(SCRIPT_PROPS.LI_COOKIE);
  const csrfToken = requireProp(SCRIPT_PROPS.LI_CSRF_TOKEN);
  const url       = getLinkedinURL(filter);
  const referer   = `https://www.linkedin.com/jobs/search/?geoId=${filter.locationUnion.geoId}`;

  log('DEBUG', 'GET %s', url);
  const response = UrlFetchApp.fetch(url, buildLiOptions(cookie, csrfToken, referer));
  return JSON.parse(response.getContentText()) as Record<string, unknown>;
}

// Fetches the "Top Applicant" job collection across the first N pages.
// Uses the graphql endpoint — same normalized JSON format, same auth, no time filter
// (LinkedIn curates the list; we rely on titlePassesPatterns + stop list for filtering).
const TOP_APPLICANT_BASE =
  'https://www.linkedin.com/voyager/api/graphql'
  + '?includeWebMetadata=true'
  + '&variables=(count:25,jobCollectionSlug:top-applicant,query:(origin:GENERIC_JOB_COLLECTIONS_LANDING),start:{START})'
  + '&queryId=voyagerJobsDashJobCards.b824e14b009b17500fbcf542cf089912';

const TOP_APPLICANT_REFERER = 'https://www.linkedin.com/jobs/collections/top-applicant/';
const TOP_APPLICANT_PAGES   = 2;

export function getTopApplicantFromLinkedin(): Record<string, unknown>[] {
  const cookie    = requireProp(SCRIPT_PROPS.LI_COOKIE);
  const csrfToken = requireProp(SCRIPT_PROPS.LI_CSRF_TOKEN);
  const options   = buildLiOptions(cookie, csrfToken, TOP_APPLICANT_REFERER);
  const pages: Record<string, unknown>[] = [];

  for (let page = 0; page < TOP_APPLICANT_PAGES; page++) {
    const url      = TOP_APPLICANT_BASE.replace('{START}', String(page * 25));
    log('DEBUG', 'Top Applicant page %s/%s: GET %s', page + 1, TOP_APPLICANT_PAGES, url);
    const response = UrlFetchApp.fetch(url, options);
    pages.push(JSON.parse(response.getContentText()) as Record<string, unknown>);
  }

  return pages;
}

export function getSearchToPerform(filter: SearchFilter): string {
  const label = [
    decodeURIComponent(filter.keywords ?? ''),
    ', ',
    GEOS[filter.locationUnion.geoId] ?? filter.locationUnion.geoId,
  ].join('').toUpperCase();
  log('INFO', 'Fetching results for: %s', label);
  return label;
}

import { requireProp, SCRIPT_PROPS } from './config/settings';
import { SF_FILTER, US_FILTER, TIME_FRAME } from './config/constants';
import { SEARCH_TITLES } from './config/titles';
import { pause } from './clock';
import { getSearchResultsFromLinkedin, getTopApplicantFromLinkedin, extractInfo, getSearchToPerform, SearchFilter, JobResult, SearchResults } from './linkedin';
import { fetchGoogleResults } from './google';
import { log } from './utils/logger';
import { doGet } from './webapp';

function readStopList(key: string): string[] {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(key);
    return raw ? JSON.parse(raw) as string[] : [];
  } catch { return []; }
}

function isBlocked(result: JobResult, companies: string[], titles: string[]): boolean {
  const co = result.company.toLowerCase();
  const ti = result.title.toLowerCase();
  return companies.some(c => co.includes(c.toLowerCase()))
      || titles.some(t => ti.includes(t.toLowerCase()));
}

function applyStopList(results: SearchResults): SearchResults {
  const blockedCos    = readStopList(SCRIPT_PROPS.STOP_LIST_COMPANIES);
  const blockedTitles = readStopList(SCRIPT_PROPS.STOP_LIST_TITLES);
  const totalBefore   = Object.keys(results).length;

  if (blockedCos.length || blockedTitles.length) {
    Object.keys(results).forEach(id => {
      const r = results[id];
      if (isBlocked(r, blockedCos, blockedTitles)) {
        log('DEBUG', 'Excluded (stop list): [%s] %s — %s', r.search, r.company, r.title);
        delete results[id];
      }
    });
  }

  const remaining = Object.values(results);
  const bysearch: Record<string, number> = {};
  remaining.forEach(r => { bysearch[r.search] = (bysearch[r.search] ?? 0) + 1; });
  log('INFO', 'Results: %s total, %s after exclusions', totalBefore, remaining.length);
  Object.entries(bysearch).forEach(([search, count]) => log('DEBUG', '  %s: %s', search, count));

  return results;
}

function formatEntry(r: JobResult, webAppUrl: string): { text: string; html: string } {
  const banCo = `${webAppUrl}?type=company&value=${encodeURIComponent(r.company)}`;
  const banTi = `${webAppUrl}?type=title&value=${encodeURIComponent(r.title)}`;
  return {
    text: [r.company, r.title, r.location, r.info, r.url, r.search, '***'].filter(Boolean).join('\n'),
    html: `<div style="margin-bottom:12px;padding:8px;border-left:3px solid #ccc">
      <strong>${r.company}</strong> <a href="${banCo}">👎</a><br>
      ${r.title} <a href="${banTi}">👎</a><br>
      ${r.location ? `<small>${r.location}</small><br>` : ''}
      ${r.info ? r.info + '<br>' : ''}
      <a href="${r.url}">${r.url}</a><br>
      <small>${r.search}</small><br>
      <small>Source: ${r.source ?? 'LinkedIn'}</small>
    </div>`,
  };
}

function notify(results: SearchResults): void {
  const email     = requireProp(SCRIPT_PROPS.MY_EMAIL);
  const webAppUrl = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.WEB_APP_URL) ?? '';
  const entries   = Object.values(results).map(r => formatEntry(r, webAppUrl));
  MailApp.sendEmail(
    email,
    `Jobs for ${new Date().toLocaleDateString()}`,
    entries.map(e => e.text).join('\n\n'),
    { htmlBody: entries.map(e => e.html).join('') }
  );
  log('INFO', 'Email sent! (%s results)', entries.length);
}

export function mergeResults(results: SearchResults, searchResults: SearchResults): SearchResults {
  return { ...results, ...searchResults };
}

function fetchResults(title: string, results: SearchResults, filter: SearchFilter, timeFrame: string): SearchResults {
  const f = { ...filter, keywords: encodeURIComponent(title), timePostedRange: [timeFrame] } as SearchFilter;
  const search = getSearchToPerform(f);
  const data   = getSearchResultsFromLinkedin(f);
  const found  = extractInfo(data as Parameters<typeof extractInfo>[0], search);
  pause(2500);
  return mergeResults(results, found);
}

// ---------------------------------------------------------------------------
// Per-provider fetchers
// ---------------------------------------------------------------------------

function getLinkedinSearchResults(timeFrame: string): SearchResults {
  let results: SearchResults = {};
  Object.entries(SEARCH_TITLES)
    .filter(([, enabled]) => enabled)
    .forEach(([title]) => {
      results = fetchResults(title, results, SF_FILTER as SearchFilter, timeFrame);
      results = fetchResults(title, results, US_FILTER as SearchFilter, timeFrame);
    });
  return results;
}

function getTopApplicantResults(): SearchResults {
  let results: SearchResults = {};
  getTopApplicantFromLinkedin().forEach(page => {
    results = mergeResults(results, extractInfo(page as Parameters<typeof extractInfo>[0], 'Top Applicant', 'LinkedIn (Top Applicant)'));
  });
  pause(2500);
  return results;
}

// ---------------------------------------------------------------------------
// Composite
// ---------------------------------------------------------------------------

export function getResults(): SearchResults {
  const timeFrame = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.SEARCH_TIME_FRAME) ?? TIME_FRAME;
  let results: SearchResults = {};
  results = mergeResults(results, getLinkedinSearchResults(timeFrame));
  results = mergeResults(results, fetchGoogleResults(timeFrame));
  results = mergeResults(results, getTopApplicantResults());
  return applyStopList(results);
}

// ---------------------------------------------------------------------------
// GAS entrypoints — full run + per-provider test runners
// ---------------------------------------------------------------------------

function getOpenReqs(): void {
  notify(getResults());
}

function runGoogle(): void {
  const timeFrame = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.SEARCH_TIME_FRAME) ?? TIME_FRAME;
  notify(applyStopList(fetchGoogleResults(timeFrame)));
}

function runLinkedin(): void {
  const timeFrame = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.SEARCH_TIME_FRAME) ?? TIME_FRAME;
  notify(applyStopList(getLinkedinSearchResults(timeFrame)));
}

function runTopApplicant(): void {
  notify(applyStopList(getTopApplicantResults()));
}

// Expose to GAS runtime
const g = global as unknown as Record<string, unknown>;
g['getOpenReqs']     = getOpenReqs;
g['runGoogle']       = runGoogle;
g['runLinkedin']     = runLinkedin;
g['runTopApplicant'] = runTopApplicant;
g['doGet']           = doGet;

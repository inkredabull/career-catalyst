import { requireProp, SCRIPT_PROPS } from './config/settings';
import { SF_FILTER, US_FILTER, TIME_FRAME } from './config/constants';
import { SEARCH_TITLES } from './config/titles';
import { pause } from './clock';
import { getSearchResultsFromLinkedin, extractInfo, getSearchToPerform, SearchFilter, JobResult, SearchResults } from './linkedin';
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

function formatEntry(r: JobResult, webAppUrl: string): { text: string; html: string } {
  const banCo = `${webAppUrl}?type=company&value=${encodeURIComponent(r.company)}`;
  const banTi = `${webAppUrl}?type=title&value=${encodeURIComponent(r.title)}`;
  return {
    text: [r.company, r.title, r.info, r.url, r.search, '***'].filter(Boolean).join('\n'),
    html: `<div style="margin-bottom:12px;padding:8px;border-left:3px solid #ccc">
      <strong>${r.company}</strong><br>
      ${r.title}<br>
      ${r.info ? r.info + '<br>' : ''}
      <a href="${r.url}">${r.url}</a><br>
      <small>${r.search}</small><br>
      <a href="${banCo}">👎 company</a> &nbsp;|&nbsp; <a href="${banTi}">👎 title</a>
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
  console.log('Email sent! (%s results)', entries.length);
}

export function mergeResults(results: SearchResults, searchResults: SearchResults): SearchResults {
  return { ...results, ...searchResults };
}

function fetchResults(title: string, results: SearchResults, filter: SearchFilter): SearchResults {
  const f = { ...filter, keywords: encodeURIComponent(title), timePostedRange: [TIME_FRAME] } as SearchFilter;
  const search = getSearchToPerform(f);
  const data   = getSearchResultsFromLinkedin(f);
  const found  = extractInfo(data as Parameters<typeof extractInfo>[0], search);
  pause(2500);
  return mergeResults(results, found);
}

export function getResults(): SearchResults {
  let results: SearchResults = {};
  SEARCH_TITLES.forEach(title => {
    results = fetchResults(title, results, SF_FILTER as SearchFilter);
    results = fetchResults(title, results, US_FILTER as SearchFilter);
  });

  const blockedCos    = readStopList(SCRIPT_PROPS.STOP_LIST_COMPANIES);
  const blockedTitles = readStopList(SCRIPT_PROPS.STOP_LIST_TITLES);
  if (blockedCos.length || blockedTitles.length) {
    Object.keys(results).forEach(id => {
      if (isBlocked(results[id], blockedCos, blockedTitles)) delete results[id];
    });
  }

  return results;
}

function getOpenReqs(): void {
  notify(getResults());
}

// Expose to GAS runtime
const g = global as unknown as Record<string, unknown>;
g['getOpenReqs'] = getOpenReqs;
g['doGet']       = doGet;

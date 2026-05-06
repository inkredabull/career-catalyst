import { requireProp, SCRIPT_PROPS } from './config/settings';
import { SF_FILTER, US_FILTER, TIME_FRAME, TITLES } from './config/constants';
import { pause } from './clock';
import { getSearchResultsFromLinkedin, extractInfo, getSearchToPerform, SearchFilter } from './linkedin';

type SearchResults = Record<string, string>;

export function readyPayload(results: SearchResults): string {
  return Object.values(results).join('\n');
}

function notify(results: SearchResults): void {
  const email = requireProp(SCRIPT_PROPS.MY_EMAIL);
  MailApp.sendEmail(email, `Jobs for ${new Date().toLocaleDateString()}`, readyPayload(results));
  console.log('Email sent!');
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
  TITLES.forEach(title => {
    results = fetchResults(title, results, SF_FILTER as SearchFilter);
    results = fetchResults(title, results, US_FILTER as SearchFilter);
  });
  return results;
}

function getOpenReqs(): void {
  notify(getResults());
}

// Expose to GAS runtime
const g = global as unknown as Record<string, unknown>;
g['getOpenReqs'] = getOpenReqs;

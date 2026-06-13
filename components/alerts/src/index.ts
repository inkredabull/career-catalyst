import { ENV } from './config/settings';
import { SF_FILTER, TIME_FRAME, STRONG_FIT_MAX_APPLICANTS, APPLICANT_SATURATION_THRESHOLD } from './config/constants';
import { SEARCH_TITLES } from './config/titles';
import { pause } from './clock';
import { getSearchResultsFromLinkedin, getTopApplicantFromLinkedin, extractInfo, getSearchToPerform, SearchFilter, JobResult, SearchResults } from './linkedin';
import { fetchGoogleResults } from './google';
import { log } from './utils/logger';
import { loadSeen, saveSeen, filterUnseen, markAsSeen, loadStopLists, saveScore, purgeOldScores } from './seen';
import { notify } from './notify';
import { scoreJob } from './scoring';

function isBlocked(result: JobResult, companies: string[], titles: string[]): boolean {
  const co = result.company.toLowerCase();
  const ti = result.title.toLowerCase();
  return companies.some(c => co.includes(c.toLowerCase().trim()))
      || titles.some(t => ti.includes(t.toLowerCase().trim()));
}

async function applyStopList(results: SearchResults): Promise<SearchResults> {
  const { companies: blockedCos, titles: blockedTitles } = await loadStopLists();
  const totalBefore = Object.keys(results).length;

  if (blockedCos.length || blockedTitles.length) {
    for (const id of Object.keys(results)) {
      const r = results[id];
      if (isBlocked(r, blockedCos, blockedTitles)) {
        log('DEBUG', 'Excluded (stop list): [%s] %s — %s', r.search, r.company, r.title);
        delete results[id];
      }
    }
  }

  const remaining = Object.values(results);
  const bysearch: Record<string, number> = {};
  remaining.forEach(r => { bysearch[r.search] = (bysearch[r.search] ?? 0) + 1; });
  log('INFO', 'Results: %s total, %s after exclusions', totalBefore, remaining.length);
  Object.entries(bysearch).forEach(([search, count]) => log('DEBUG', '  %s: %s', search, count));

  return results;
}

export function mergeResults(results: SearchResults, searchResults: SearchResults): SearchResults {
  return { ...results, ...searchResults };
}

async function fetchResults(title: string, results: SearchResults, filter: SearchFilter, timeFrame: string): Promise<SearchResults> {
  const f = { ...filter, keywords: encodeURIComponent(title), timePostedRange: [timeFrame] } as SearchFilter;
  const search = getSearchToPerform(f);
  const data   = await getSearchResultsFromLinkedin(f);
  const found  = extractInfo(data, search);
  await pause(2500);
  return mergeResults(results, found);
}

async function getLinkedinSearchResults(timeFrame: string): Promise<SearchResults> {
  let results: SearchResults = {};
  const enabledTitles = Object.entries(SEARCH_TITLES)
    .filter(([, enabled]) => enabled)
    .map(([title]) => title);

  for (const title of enabledTitles) {
    results = await fetchResults(title, results, SF_FILTER as SearchFilter, timeFrame);
    // results = await fetchResults(title, results, US_FILTER as SearchFilter, timeFrame);
  }
  return results;
}

async function getTopApplicantResults(): Promise<SearchResults> {
  let results: SearchResults = {};
  const pages = await getTopApplicantFromLinkedin();
  for (const page of pages) {
    results = mergeResults(results, extractInfo(page, 'Top Applicant', 'LinkedIn (Top Applicant)'));
  }
  await pause(2500);
  return results;
}

export async function getResults(): Promise<SearchResults> {
  const timeFrame = process.env[ENV.SEARCH_TIME_FRAME] ?? TIME_FRAME;
  let results: SearchResults = {};
  results = mergeResults(results, await getLinkedinSearchResults(timeFrame));
  results = mergeResults(results, await fetchGoogleResults(timeFrame));
  results = mergeResults(results, await getTopApplicantResults());
  return applyStopList(results);
}

export async function getOpenReqs(webAppUrl: string): Promise<void> {
  const startedAt = Date.now();
  await purgeOldScores().catch(err => log('WARN', 'Score purge failed: %s', (err as Error).message));
  const results = await getResults();
  const seen    = await loadSeen();
  const fresh   = filterUnseen(results, seen);

  if (Object.keys(fresh).length === 0) {
    log('INFO', 'No new results, skipping email');
    return;
  }

  log('INFO', 'Scoring %s fresh jobs...', Object.keys(fresh).length);
  await Promise.all(
    Object.values(fresh).map(async (job) => {
      const { verdict, reasoning } = await scoreJob(job);
      job.judgment = verdict;
      if (verdict !== '🔴') {
        try {
          await saveScore(job.id, { job, verdict, reasoning, scoredAt: new Date().toISOString() });
        } catch (err) {
          log('WARN', 'Score save failed for %s (%s): %s', job.id, job.title, (err as Error).message);
        }
      }
      log('DEBUG', 'Scored [%s]: %s — %s', verdict, job.company, job.title);
    })
  );

  for (const job of Object.values(fresh)) {
    if (job.applicants !== undefined && job.applicants >= APPLICANT_SATURATION_THRESHOLD) {
      log('INFO', 'Forced 🔴 Pass (%s applicants ≥ %s, oversaturated): [%s] %s — %s', job.applicants, APPLICANT_SATURATION_THRESHOLD, job.search, job.company, job.title);
      job.judgment = '🔴';
    } else if (job.judgment === '🟢' && job.applicants !== undefined && job.applicants >= STRONG_FIT_MAX_APPLICANTS) {
      log('INFO', 'Demoted 🟢→🟡 (%s applicants): [%s] %s — %s', job.applicants, job.search, job.company, job.title);
      job.judgment = '🟡';
    }
  }

  const judgmentSummary = Object.values(fresh).map(j => j.judgment ?? '?').join(' ');
  log('INFO', 'Judgments before notify: %s', judgmentSummary);
  const toNotify = Object.fromEntries(Object.entries(fresh).filter(([, j]) => j.judgment !== '🔴'));
  if (Object.keys(toNotify).length === 0) {
    log('INFO', 'All %s fresh jobs were 🔴 Pass — skipping email', Object.keys(fresh).length);
    await saveSeen(markAsSeen(fresh, seen));
    return;
  }
  log('INFO', 'Sending email for %s jobs (%s passed filter)...', Object.keys(toNotify).length, Object.keys(fresh).length);
  await notify(toNotify, webAppUrl, Date.now() - startedAt);
  log('INFO', 'Email sent, saving seen...');
  await saveSeen(markAsSeen(fresh, seen));
  log('INFO', 'Done.');
}

export async function runGoogle(): Promise<void> {
  const timeFrame = process.env[ENV.SEARCH_TIME_FRAME] ?? TIME_FRAME;
  const results = await applyStopList(await fetchGoogleResults(timeFrame));
  const webAppUrl = process.env['WEB_APP_URL'] ?? '';
  await notify(results, webAppUrl);
}

export async function runLinkedin(): Promise<void> {
  const timeFrame = process.env[ENV.SEARCH_TIME_FRAME] ?? TIME_FRAME;
  const results = await applyStopList(await getLinkedinSearchResults(timeFrame));
  const webAppUrl = process.env['WEB_APP_URL'] ?? '';
  await notify(results, webAppUrl);
}

export async function runTopApplicant(): Promise<void> {
  const results = await applyStopList(await getTopApplicantResults());
  const webAppUrl = process.env['WEB_APP_URL'] ?? '';
  await notify(results, webAppUrl);
}

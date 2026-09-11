import { ENV } from "./config/settings";
import {
  SF_FILTER,
  US_FILTER,
  TIME_FRAME,
  STRONG_FIT_MAX_APPLICANTS,
  APPLICANT_SATURATION_THRESHOLD,
} from "./config/constants";
import { SEARCH_TITLES } from "./config/titles";
import { pause } from "./clock";
import {
  getSearchResultsFromLinkedin,
  getTopApplicantFromLinkedin,
  extractInfo,
  getSearchToPerform,
  SearchFilter,
  SearchResults,
} from "./linkedin";
import { fetchDiscoveryResults, shouldRunDiscovery } from "./discovery";
import { fetchAtsResults } from "./ats";
import { log, flushLogs } from "./utils/logger";
import { withConcurrency } from "./utils/concurrency";
import {
  loadSeen,
  saveSeen,
  filterUnseen,
  markAsSeen,
  loadStopLists,
  matchingStopEntries,
  saveScore,
  purgeOldScores,
} from "./seen";
import { notify } from "./notify";
import { scoreJob } from "./scoring";

async function applyStopList(results: SearchResults): Promise<SearchResults> {
  const lists = await loadStopLists();
  const totalBefore = Object.keys(results).length;

  if (lists.companies.length || lists.titles.length) {
    for (const id of Object.keys(results)) {
      const r = results[id];
      const hits = matchingStopEntries(lists, r.company, r.title);
      if (hits.length === 0) continue;

      // Everything reaching here already passed the active title patterns, so
      // an exclusion is always a role the current batch asked for. Company
      // hits are almost always intentional (agency reposts); a title hit is
      // the one that quietly outlives the batch it was added for — entries are
      // substrings, so "Head of AI" swallows "Head of AI Enablement" — so name
      // the culprit and say it louder.
      const byTitle = hits.filter((h) => h.type === "title");
      log(
        byTitle.length > 0 ? "INFO" : "DEBUG",
        "Excluded (stop list %s %s): [%s] %s — %s",
        hits[0].type,
        `"${hits[0].value}"`,
        r.search,
        r.company,
        r.title,
      );
      delete results[id];
    }
  }

  const remaining = Object.values(results);
  const bysearch: Record<string, number> = {};
  remaining.forEach((r) => {
    bysearch[r.search] = (bysearch[r.search] ?? 0) + 1;
  });
  log(
    "INFO",
    "Results: %s total, %s after exclusions",
    totalBefore,
    remaining.length,
  );
  Object.entries(bysearch).forEach(([search, count]) =>
    log("DEBUG", "  %s: %s", search, count),
  );

  return results;
}

export function mergeResults(
  results: SearchResults,
  searchResults: SearchResults,
): SearchResults {
  return { ...results, ...searchResults };
}

async function fetchResults(
  title: string,
  results: SearchResults,
  filter: SearchFilter,
  timeFrame: string,
): Promise<SearchResults> {
  const f = {
    ...filter,
    keywords: encodeURIComponent(title),
    timePostedRange: [timeFrame],
  } as SearchFilter;
  const search = getSearchToPerform(f);
  const data = await getSearchResultsFromLinkedin(f);
  const found = extractInfo(data, search);
  await pause(2500);
  return mergeResults(results, found);
}

async function getLinkedinSearchResults(
  timeFrame: string,
): Promise<SearchResults> {
  let results: SearchResults = {};
  const enabledTitles = Object.entries(SEARCH_TITLES)
    .filter(([, enabled]) => enabled)
    .map(([title]) => title);

  for (const title of enabledTitles) {
    results = await fetchResults(
      title,
      results,
      SF_FILTER as SearchFilter,
      timeFrame,
    );
    results = await fetchResults(
      title,
      results,
      US_FILTER as SearchFilter,
      timeFrame,
    );
  }
  return results;
}

async function getTopApplicantResults(): Promise<SearchResults> {
  let results: SearchResults = {};
  const pages = await getTopApplicantFromLinkedin();
  for (const page of pages) {
    results = mergeResults(
      results,
      extractInfo(page, "Top Applicant", "LinkedIn (Top Applicant)"),
    );
  }
  await pause(2500);
  return results;
}

export function deduplicateByCompanyTitle(
  results: SearchResults,
): SearchResults {
  const seen = new Set<string>();
  const deduped: SearchResults = {};
  for (const [id, job] of Object.entries(results)) {
    const key = `${job.company.toLowerCase()}|||${job.title.toLowerCase()}`;
    if (seen.has(key)) {
      log(
        "DEBUG",
        "Dedup (company+title): [%s] %s — %s",
        job.search,
        job.company,
        job.title,
      );
      continue;
    }
    seen.add(key);
    deduped[id] = job;
  }
  const dropped = Object.keys(results).length - Object.keys(deduped).length;
  if (dropped > 0) log("INFO", "Deduped %s cross-source duplicates", dropped);
  return deduped;
}

export async function getResults(): Promise<SearchResults> {
  const timeFrame = process.env[ENV.SEARCH_TIME_FRAME] ?? TIME_FRAME;
  let results: SearchResults = {};
  results = mergeResults(results, await getLinkedinSearchResults(timeFrame));
  // ATS before the search layer: its company names are canonical rather than
  // parsed out of a page title, so they win the shallow merge and seed
  // deduplicateByCompanyTitle's first pass with the clean spelling.
  results = mergeResults(results, await fetchAtsResults(timeFrame));
  if (shouldRunDiscovery()) {
    results = mergeResults(results, await fetchDiscoveryResults());
  } else {
    log("INFO", "Skipping discovery this run (Exa budget — runs every 8h)");
  }
  results = mergeResults(results, await getTopApplicantResults());
  results = deduplicateByCompanyTitle(results);
  return applyStopList(results);
}

export async function getOpenReqs(webAppUrl: string): Promise<void> {
  const startedAt = Date.now();
  await purgeOldScores().catch((err) =>
    log("WARN", "Score purge failed: %s", (err as Error).message),
  );
  const results = await getResults();
  const seen = await loadSeen();
  const fresh = filterUnseen(results, seen);

  if (Object.keys(fresh).length > 0) {
    // Mark fresh jobs as seen BEFORE scoring so a timeout doesn't cause re-scoring on the next run
    await saveSeen(markAsSeen(fresh, seen));
    log("INFO", "Scoring %s fresh jobs...", Object.keys(fresh).length);
    await withConcurrency(Object.values(fresh), 5, async (job) => {
      const { verdict, reasoning } = await scoreJob(job);
      job.judgment = verdict;
      try {
        await saveScore(job.id, {
          job,
          verdict,
          reasoning,
          scoredAt: new Date().toISOString(),
        });
      } catch (err) {
        log(
          "WARN",
          "Score save failed for %s (%s): %s",
          job.id,
          job.title,
          (err as Error).message,
        );
      }
      log("DEBUG", "Scored [%s]: %s — %s", verdict, job.company, job.title);
    });

    for (const job of Object.values(fresh)) {
      if (
        job.applicants !== undefined &&
        job.applicants >= APPLICANT_SATURATION_THRESHOLD
      ) {
        log(
          "INFO",
          "Forced 🔴 Pass (%s applicants ≥ %s, oversaturated): [%s] %s — %s",
          job.applicants,
          APPLICANT_SATURATION_THRESHOLD,
          job.search,
          job.company,
          job.title,
        );
        job.judgment = "🔴";
      } else if (
        job.judgment === "🟢" &&
        job.applicants !== undefined &&
        job.applicants >= STRONG_FIT_MAX_APPLICANTS
      ) {
        log(
          "INFO",
          "Demoted 🟢→🟡 (%s applicants): [%s] %s — %s",
          job.applicants,
          job.search,
          job.company,
          job.title,
        );
        job.judgment = "🟡";
      }
    }

    const judgmentSummary = Object.values(fresh)
      .map((j) => j.judgment ?? "?")
      .join(" ");
    log("INFO", "Judgments before notify: %s", judgmentSummary);
  } else {
    log("INFO", "No new results this run");
  }

  const toNotify = Object.fromEntries(
    Object.entries(fresh).filter(([, j]) => j.judgment !== "🔴"),
  );
  const passed = Object.fromEntries(
    Object.entries(fresh).filter(([, j]) => j.judgment === "🔴"),
  );
  if (Object.keys(toNotify).length === 0) {
    log(
      "INFO",
      "Nothing worth highlighting (%s pass, %s total fresh) — skipping email.",
      Object.keys(passed).length,
      Object.keys(fresh).length,
    );
    return;
  }

  log(
    "INFO",
    "Sending email (%s jobs to highlight, %s pass, %s total fresh)...",
    Object.keys(toNotify).length,
    Object.keys(passed).length,
    Object.keys(fresh).length,
  );
  await notify(
    toNotify,
    webAppUrl,
    Date.now() - startedAt,
    flushLogs(),
    passed,
  );
  log("INFO", "Done.");
}

export async function runDiscovery(): Promise<void> {
  const results = await applyStopList(await fetchDiscoveryResults());
  const webAppUrl = process.env["WEB_APP_URL"] ?? "";
  await notify(results, webAppUrl);
}

export async function runLinkedin(): Promise<void> {
  const timeFrame = process.env[ENV.SEARCH_TIME_FRAME] ?? TIME_FRAME;
  const results = await applyStopList(
    await getLinkedinSearchResults(timeFrame),
  );
  const webAppUrl = process.env["WEB_APP_URL"] ?? "";
  await notify(results, webAppUrl);
}

export async function runTopApplicant(): Promise<void> {
  const results = await applyStopList(await getTopApplicantResults());
  const webAppUrl = process.env["WEB_APP_URL"] ?? "";
  await notify(results, webAppUrl);
}

export async function runAts(): Promise<void> {
  const timeFrame = process.env[ENV.SEARCH_TIME_FRAME] ?? TIME_FRAME;
  const results = await applyStopList(
    deduplicateByCompanyTitle(await fetchAtsResults(timeFrame)),
  );
  const webAppUrl = process.env["WEB_APP_URL"] ?? "";
  await notify(results, webAppUrl);
}

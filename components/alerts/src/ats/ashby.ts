import {
  AtsJob,
  asObjectArray,
  isoToMs,
  normalizeWhitespace,
  str,
} from "./types";

export function ashbyUrl(token: string): string {
  return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}`;
}

/**
 * Ashby posting API → AtsJob[].
 *
 * Envelope: `{ jobs: [...], apiVersion }`. Unlisted postings are still present
 * in the payload with `isListed: false` — those are drafts or internal-only
 * reqs and must be dropped.
 *
 * Note these responses are large (OpenAI's is ~13 MB) because full HTML and
 * plaintext descriptions are always inlined and cannot be excluded.
 */
export function normalizeAshby(raw: unknown): AtsJob[] {
  if (typeof raw !== "object" || raw === null) return [];
  const jobs = asObjectArray((raw as Record<string, unknown>)["jobs"]);

  return jobs.flatMap((job): AtsJob[] => {
    if (job["isListed"] === false) return [];

    const title = str(job, "title");
    const url = str(job, "jobUrl") || str(job, "applyUrl");
    if (!title || !url) return [];

    const secondary = Array.isArray(job["secondaryLocations"])
      ? job["secondaryLocations"]
          .map((l) =>
            typeof l === "string"
              ? normalizeWhitespace(l)
              : typeof l === "object" && l !== null
                ? str(l as Record<string, unknown>, "location")
                : "",
          )
          .filter(Boolean)
      : [];
    const location = [str(job, "location"), ...secondary]
      .filter(Boolean)
      .join(", ");

    const externalId = str(job, "id");

    return [
      {
        externalId,
        title,
        url,
        location,
        publishedAtMs: isoToMs(job["publishedAt"]),
        dedupKey: externalId || title.toLowerCase(),
      },
    ];
  });
}

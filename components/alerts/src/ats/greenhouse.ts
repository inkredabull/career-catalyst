import { AtsJob, asObjectArray, isoToMs, str } from "./types";

export function greenhouseUrl(token: string): string {
  return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs`;
}

/**
 * Greenhouse board API → AtsJob[].
 *
 * Envelope: `{ jobs: [...] }`. Dates come from `first_published`, not
 * `updated_at` — the latter churns whenever a recruiter touches the req, which
 * would resurface months-old postings on every run.
 *
 * Greenhouse fans one requisition out into a separate job object per location,
 * so `dedupKey` prefers the requisition id; the caller collapses on it.
 */
export function normalizeGreenhouse(raw: unknown): AtsJob[] {
  if (typeof raw !== "object" || raw === null) return [];
  const jobs = asObjectArray((raw as Record<string, unknown>)["jobs"]);

  return jobs.flatMap((job): AtsJob[] => {
    const title = str(job, "title");
    const url = str(job, "absolute_url");
    if (!title || !url) return [];

    const loc = job["location"];
    const location =
      typeof loc === "object" && loc !== null
        ? str(loc as Record<string, unknown>, "name")
        : "";

    const externalId = String(job["id"] ?? "");
    const dedupKey =
      str(job, "requisition_id") ||
      String(job["internal_job_id"] ?? "") ||
      title.toLowerCase();

    return [
      {
        externalId,
        title,
        url,
        location,
        publishedAtMs: isoToMs(job["first_published"]),
        dedupKey,
      },
    ];
  });
}

import { AtsJob, asObjectArray, str } from "./types";

export function leverUrl(token: string): string {
  return `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`;
}

/**
 * Lever postings API → AtsJob[].
 *
 * Three ways this differs from the other two providers, each of which fails
 * silently rather than loudly if you assume the common shape:
 *   1. The response is a BARE ARRAY, not `{ jobs: [...] }`.
 *   2. The title field is `text`, not `title`.
 *   3. `createdAt` is already epoch MILLISECONDS as a number — do not
 *      Date.parse it and do not multiply by 1000.
 */
export function normalizeLever(raw: unknown): AtsJob[] {
  return asObjectArray(raw).flatMap((job): AtsJob[] => {
    const title = str(job, "text");
    const url = str(job, "hostedUrl") || str(job, "applyUrl");
    if (!title || !url) return [];

    const categories = job["categories"];
    const location =
      typeof categories === "object" && categories !== null
        ? str(categories as Record<string, unknown>, "location")
        : "";

    const createdAt = job["createdAt"];
    const publishedAtMs = typeof createdAt === "number" ? createdAt : 0;

    const externalId = str(job, "id");

    return [
      {
        externalId,
        title,
        url,
        location,
        publishedAtMs,
        dedupKey: externalId || title.toLowerCase(),
      },
    ];
  });
}

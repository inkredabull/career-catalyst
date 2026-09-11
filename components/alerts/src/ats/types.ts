/** A job posting normalized out of one of the ATS board APIs. */
export interface AtsJob {
  /** The ATS's own id, used for intra-board dedup. */
  externalId: string;
  title: string;
  url: string;
  /** "" when the provider gives none. */
  location: string;
  /** Epoch ms. 0 when the provider gave no parseable date. */
  publishedAtMs: number;
  /**
   * Intra-board dedup key. Greenhouse fans a single requisition out into one
   * job object per location, so this collapses them; falls back to the title
   * when the provider exposes no requisition id.
   */
  dedupKey: string;
}

/**
 * Collapse the whitespace ATS boards actually emit.
 *
 * Real board titles contain U+00A0 — Vercel/Greenhouse returns a trailing one
 * on "Forward-Deployed Engineer". JS \s does match it, so the title
 * filters survive it either way, but deduplicateByCompanyTitle keys on the raw
 * lowercased string — an nbsp variant would not dedupe against the ordinary
 * space variant, and it renders oddly in the digest.
 */
export function normalizeWhitespace(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Narrow an unknown JSON value to an array of plain objects. */
export function asObjectArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is Record<string, unknown> =>
      typeof v === "object" && v !== null && !Array.isArray(v),
  );
}

/** Read a string field, whitespace-normalized, returning "" for anything else. */
export function str(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === "string" ? normalizeWhitespace(v) : "";
}

/** Parse an ISO date string to epoch ms, or 0 when absent/unparseable. */
export function isoToMs(value: unknown): number {
  if (typeof value !== "string") return 0;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? 0 : ms;
}

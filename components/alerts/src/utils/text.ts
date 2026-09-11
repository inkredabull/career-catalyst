/**
 * Collapse the whitespace job sources actually emit.
 *
 * Both ATS boards and search results contain U+00A0 — Greenhouse returns a
 * trailing one on "Forward-Deployed Engineer", and Lever page titles come back
 * with them between every word. JS \s does match U+00A0, so the title filters
 * survive either way, but deduplicateByCompanyTitle keys on the raw lowercased
 * string: an nbsp variant would not dedupe against the ordinary space variant,
 * and it renders oddly in the digest.
 */
export function normalizeWhitespace(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

import { INCLUDE_PATTERNS, EXCLUDE_PATTERNS } from "./config/titles";

/**
 * Excludes always win. A title must then match at least one include pattern.
 *
 * `include` defaults to the patterns for the currently active title batches;
 * pass an explicit set to check a title against a batch that is switched off.
 *
 * An empty include list rejects everything rather than allowing everything.
 * The list is derived from ACTIVE_BATCHES, so empty means no batch is active —
 * a misconfiguration where an empty digest is the safe reading, not one
 * carrying every posting on all 20 boards.
 */
export function titlePassesPatterns(
  title: string,
  include: RegExp[] = INCLUDE_PATTERNS,
): boolean {
  if (EXCLUDE_PATTERNS.some((re) => re.test(title))) return false;
  return include.some((re) => re.test(title));
}

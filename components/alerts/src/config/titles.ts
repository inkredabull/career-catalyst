/**
 * Search queries sent to LinkedIn. Set a title's value to false to disable it
 * without removing it — makes it easy to re-enable without losing the entry.
 */
export const SEARCH_TITLES: Record<string, boolean> = {
  "Chief of Staff to the CTO": true,
  "Head of Engineering Operations": true,
  "Head of AI Engineering": false,
  "Head of Technical Strategy": false,
  "VP Engineering": true,
  "Head of Engineering": false,
  CTO: true,
  CPTO: false,
  "Chief Product & Technology Officer": true,
  "Director of Engineering": true,
  "AI Enablement Engineer": false,
  "Forward Deployed Engineer": false,
  "Technical Program Manager": true,
  "Technical Product Manager": false,
  "Solutions Engineer": false,
  "Solutions Architect": false,
  "Field CTO": false,
  "Developer Relations": false,
  "Fractional CTO": true,
  "Head of Product and Technology": true,
  "VP of Product Engineering": true,
  "Head of Product Engineering": true,
  "Director of Product Engineering": true,
};

/**
 * Result title must match at least one of these to be included.
 * LinkedIn `keywords` is full-text search — it returns jobs where the term
 * appears anywhere in the posting, not just the title. These patterns act as
 * a positive allowlist so noise (e.g. "Business Development Director") is
 * rejected even when LinkedIn surfaces it for a "CPTO" keyword search.
 */
export const INCLUDE_PATTERNS: RegExp[] = [
  // CTO, Field CTO, Fractional CTO, "Chief of Staff to the CTO"
  /\bCTO\b/i,
  // CPTO — separate from CTO because the letters C-P-T-O don't contain the substring "CTO"
  /\bCPTO\b/i,
  // full spelling LinkedIn sometimes returns instead of the acronym
  /Chief\s+(Technology|Technical)\s+Officer/i,
  // VP Engineering, VP of Product Engineering, Vice President Engineering, etc.
  // No trailing \b on the second group — "engineer" must prefix-match "Engineering"
  /\b(VP|V\.P\.|Vice\s+President)\b.*(engineer|product|tech|platform|ai)/i,
  // Head of Engineering, Head of AI Engineering, Head of Technical Strategy,
  // Head of Engineering Operations, Head of Product and Technology
  /\bHead\s+of\s+(engineer|ai|tech|product|platform|operat)/i,
  // Director of Engineering, Director of Product Engineering, Senior Director of Engineering, etc.
  /\bDirector\b.*(engineer|tech|platform|ai)/i,
  // Technical Program Manager, Technical Product Manager
  /\b(Technical|AI)\s+(Program|Product)\s+Manager\b/i,
  // Solutions Engineer, Solutions Architect, Forward Deployed Engineer, AI Enablement Engineer
  /\b(Solutions|Forward.Deployed|AI.Enablement)\s+(Engineer|Architect)\b/i,
  // Developer Relations
  /\bDeveloper\s+Relations\b/i,
  // Chief of Staff (CTO\b also catches "Chief of Staff to the CTO", belt-and-suspenders)
  /\bChief\s+of\s+Staff\b/i,
];

/**
 * Result title matching any of these is always rejected,
 * regardless of which search term found it.
 */
export const EXCLUDE_PATTERNS: RegExp[] = [
  /\bfounding (research )?engineer\b/i,
  /\bsecurity engineer\b/i,
  /\bprincipal engineer\b/i,
  /\bstaff engineer\b/i,
  /\bdata engineer\b/i,
  /\bdistinguished engineer\b/i,
  /\bsoftware engineer\b/i,
  /\bexecutive director\b/i,
  /\bdirector of research\b/i,
  /\bhead of it\b/i,
];

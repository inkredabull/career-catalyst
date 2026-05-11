/** Titles sent as queries to LinkedIn search */
export const SEARCH_TITLES: string[] = [
  'Chief of Staff to the CTO',
  'Head of Engineering Operations',
  'Head of AI Engineering',
  'Head of Technical Strategy',
  'VP Engineering',
  'Head of Engineering',
  'CTO',
  'CPTO',
  'Director of Engineering',
  'AI Enablement Engineer',
  'Forward Deployed Engineer',
  'Technical Program Manager',
  'Technical Product Manager',
  'Solutions Engineer',
  'Solutions Architect',
  'Field CTO',
  'Developer Relations',
  'Fractional CTO',
  'Head of Product and Technology',
  'VP of Product Engineering',
  'Head of Product Engineering',
  'Director of Product Engineering',
];

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

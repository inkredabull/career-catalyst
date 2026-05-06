/** Titles sent as queries to LinkedIn search */
export const SEARCH_TITLES: string[] = [
  'Chief of Staff to the CTO',
  'Head of Engineering Operations',
  'VP of Platform Engineering',
  'Chief Technologist',
  'VP of Operations',
  'Head of AI Engineering',
  'Head of Technical Strategy',
  'VP Engineering',
  'Head of Engineering',
  'CTO',
  'Director of Engineering',
  'AI Engineer',
  'AI Enablement Engineer',
  'Technical Program Manager',
  'Forward Deployed Engineer',

  // uncomment to expand:
  // 'VP Product',
  // 'Director of Product Management',
  // 'Technical Product Manager',
  // 'Solutions Engineer',
  // 'Solutions Architect',
  // 'Field CTO',
  // 'Developer Relations',
  // 'Fractional CTO',
  // 'Head of Product and Technology',
];

/**
 * Result title must match at least one of these to be included.
 * Leave empty to skip positive filtering (rely on EXCLUDE_PATTERNS alone).
 */
export const INCLUDE_PATTERNS: RegExp[] = [];

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

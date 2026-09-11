export type TitleBatch = "previous" | "ai-enablement";

interface TitleDef {
  title: string;
  batch: TitleBatch;
}

const ALL_TITLES: TitleDef[] = [
  // previous batch — the pre-existing title set
  { title: "Chief of Staff to the CTO", batch: "previous" },
  { title: "Head of Engineering Operations", batch: "previous" },
  { title: "Head of AI Engineering", batch: "previous" },
  { title: "Head of Technical Strategy", batch: "previous" },
  { title: "VP Engineering", batch: "previous" },
  { title: "Head of Engineering", batch: "previous" },
  { title: "CTO", batch: "previous" },
  { title: "CPTO", batch: "previous" },
  { title: "Chief Product & Technology Officer", batch: "previous" },
  { title: "Director of Engineering", batch: "previous" },
  { title: "AI Enablement Engineer", batch: "previous" },
  { title: "Forward Deployed Engineer", batch: "previous" },
  { title: "Technical Program Manager", batch: "previous" },
  { title: "Technical Product Manager", batch: "previous" },
  { title: "Solutions Engineer", batch: "previous" },
  { title: "Solutions Architect", batch: "previous" },
  { title: "Field CTO", batch: "previous" },
  { title: "Developer Relations", batch: "previous" },
  { title: "Fractional CTO", batch: "previous" },
  { title: "Head of Product and Technology", batch: "previous" },
  { title: "VP of Product Engineering", batch: "previous" },
  { title: "Head of Product Engineering", batch: "previous" },
  { title: "Director of Product Engineering", batch: "previous" },

  // ai-enablement batch
  { title: "AI Enablement", batch: "ai-enablement" },
  { title: "AI Enablement Engineering", batch: "ai-enablement" },
  { title: "Developer Productivity", batch: "ai-enablement" },
  { title: "Engineering Effectiveness", batch: "ai-enablement" },
  { title: "AI Transformation", batch: "ai-enablement" },
  { title: "AI Center of Excellence", batch: "ai-enablement" },
  { title: "AI Adoption", batch: "ai-enablement" },
  { title: "AI Delivery Engineer", batch: "ai-enablement" },
];

/**
 * Flip a whole batch of titles on/off at once instead of editing individual
 * entries — set a batch to `true` to activate every title tagged with it.
 */
export const ACTIVE_BATCHES: Record<TitleBatch, boolean> = {
  previous: false,
  "ai-enablement": true,
};

/** Search queries sent to LinkedIn/Google, derived from ALL_TITLES + ACTIVE_BATCHES above. */
export const SEARCH_TITLES: Record<string, boolean> = Object.fromEntries(
  ALL_TITLES.map(({ title, batch }) => [title, ACTIVE_BATCHES[batch]]),
);

/**
 * Result title must match at least one active pattern to be included.
 *
 * LinkedIn `keywords` is full-text search — it returns jobs where the term
 * appears anywhere in the posting, not just the title. These patterns act as
 * a positive allowlist so noise (e.g. "Business Development Director") is
 * rejected even when LinkedIn surfaces it for a "CPTO" keyword search.
 *
 * They are batched alongside the titles because they are the ONLY filter on
 * the sources that take no keyword: the ATS boards and LinkedIn's Top Applicant
 * feed. Switching batches without switching these would narrow the keyword
 * searches while those two kept pouring the old batch's roles into the digest.
 */
const ALL_INCLUDE_PATTERNS: { batch: TitleBatch; pattern: RegExp }[] = [
  // --- previous: exec / engineering leadership ---------------------------
  // CTO, Field CTO, Fractional CTO, "Chief of Staff to the CTO"
  { batch: "previous", pattern: /\bCTO\b/i },
  // CPTO — separate from CTO because the letters C-P-T-O don't contain "CTO"
  { batch: "previous", pattern: /\bCPTO\b/i },
  // full spelling LinkedIn sometimes returns instead of the acronym.
  // Tolerates words between "Chief" and "Officer" so the spelled-out CPTO
  // ("Chief Product & Technology Officer") matches. The [\w&,\s] class excludes
  // separators like "-" and "|", so it can't leap across two adjacent titles.
  {
    batch: "previous",
    pattern:
      /\bChief\b[\w&,\s]*\b(Technology|Technical)\b[\w&,\s]*\bOfficer\b/i,
  },
  // VP Engineering, VP of Product Engineering, Vice President Engineering, etc.
  // No trailing \b on the second group — "engineer" must prefix-match "Engineering".
  // "AI" is bounded: an unbounded "ai" matches Affairs, Campaigns, Chain, Retail.
  {
    batch: "previous",
    pattern:
      /\b(VP|V\.P\.|Vice\s+President)\b.*(engineer|product|tech|platform|\bAI\b)/i,
  },
  // Head of Engineering, Head of AI Engineering, Head of Technical Strategy,
  // Head of Engineering Operations, Head of Product and Technology
  {
    batch: "previous",
    pattern: /\bHead\s+of\s+(engineer|ai|tech|product|platform|operat)/i,
  },
  // Director of Engineering, Director of Product Engineering, etc.
  // "AI" bounded for the same reason as the VP pattern above.
  {
    batch: "previous",
    pattern: /\bDirector\b.*(engineer|tech|platform|\bAI\b)/i,
  },
  // Technical Program Manager, Technical Product Manager
  {
    batch: "previous",
    pattern: /\b(Technical|AI)\s+(Program|Product)\s+Manager\b/i,
  },
  // Solutions Engineer, Solutions Architect, Forward Deployed Engineer
  {
    batch: "previous",
    pattern: /\b(Solutions|Forward.Deployed)\s+(Engineer|Architect)\b/i,
  },
  // Developer Relations
  { batch: "previous", pattern: /\bDeveloper\s+Relations\b/i },
  // Chief of Staff (\bCTO\b also catches "Chief of Staff to the CTO")
  { batch: "previous", pattern: /\bChief\s+of\s+Staff\b/i },

  // --- ai-enablement ------------------------------------------------------
  // AI Enablement, AI Enablement Engineering, AI Transformation, AI Adoption
  {
    batch: "ai-enablement",
    pattern: /\bAI\s+(Enablement|Transformation|Adoption)\b/i,
  },
  // AI Center of Excellence
  { batch: "ai-enablement", pattern: /\bAI\s+Center\s+of\s+Excellence\b/i },
  // Developer Productivity, Engineering Effectiveness
  {
    batch: "ai-enablement",
    pattern: /\b(Developer\s+Productivity|Engineering\s+Effectiveness)\b/i,
  },
  // AI Enablement Engineer, AI Delivery Engineer — the enablement half of the
  // Solutions/Forward-Deployed family above.
  {
    batch: "ai-enablement",
    pattern: /\b(AI.Enablement|AI.Delivery)\s+(Engineer|Architect)\b/i,
  },
];

/** The include patterns belonging to the given set of active batches. */
export function includePatternsFor(
  active: Record<TitleBatch, boolean>,
): RegExp[] {
  return ALL_INCLUDE_PATTERNS.filter((p) => active[p.batch]).map(
    (p) => p.pattern,
  );
}

export const INCLUDE_PATTERNS: RegExp[] = includePatternsFor(ACTIVE_BATCHES);

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
  // "Director, Technical Revenue Accounting" clears the Director pattern on
  // the word "Technical". Finance roles never want to be in this digest.
  /\baccounting\b/i,
];

import { titlePassesPatterns } from "../filters";
import { includePatternsFor } from "../config/titles";

/** Every batch on — for asserting a pattern works regardless of what is active. */
const ALL = includePatternsFor({ previous: true, "ai-enablement": true });
/** Only the batch that is actually active today. */
const AI = includePatternsFor({ previous: false, "ai-enablement": true });

describe("titlePassesPatterns — include patterns (positive allowlist)", () => {
  const shouldPass = [
    // CTO family
    "CTO",
    "CPTO",
    "Field CTO",
    "Fractional CTO",
    "Chief of Staff to the CTO",
    "Chief Technology Officer",
    "Chief Technical Officer",
    // spelled-out CPTO — an enabled SEARCH_TITLES entry that used to be rejected
    "Chief Product & Technology Officer",
    "Chief Product and Technology Officer",
    // VP family
    "VP Engineering",
    "VP of Engineering",
    "VP of Product Engineering",
    "Vice President Engineering",
    "Vice President of AI",
    // Head of family
    "Head of Engineering",
    "Head of Engineering Operations",
    "Head of AI Engineering",
    "Head of Technical Strategy",
    "Head of Product and Technology",
    "Head of Platform Engineering",
    // Director family
    "Director of Engineering",
    "Director of Product Engineering",
    "Senior Director of Engineering",
    "Director, Product Engineering",
    // real ATS titles — guards against over-tightening the "AI" boundary
    "Director of Engineering, Safety",
    "Director, Forward Deployed Engineering",
    // Technical managers
    "Technical Program Manager",
    "Technical Product Manager",
    "AI Product Manager",
    // Engineering roles
    "Solutions Engineer",
    "Solutions Architect",
    "Forward Deployed Engineer",
    "AI Enablement Engineer",
    // Developer Relations
    "Developer Relations",
    // Chief of Staff (standalone)
    "Chief of Staff",
    // AI enablement family
    "Head of AI Enablement",
    "AI Enablement Engineering Lead",
    "Developer Productivity Engineer",
    "Engineering Effectiveness Manager",
    "Director of AI Transformation",
    "AI Center of Excellence Lead",
    "Head of AI Adoption",
    "AI Delivery Engineer",
  ];

  test.each(shouldPass)("accepts: %s", (title) => {
    expect(titlePassesPatterns(title, ALL)).toBe(true);
  });
});

describe("titlePassesPatterns — exclude patterns (explicit blocklist)", () => {
  const shouldFail = [
    "Software Engineer",
    "Staff Engineer",
    "Principal Engineer",
    "Security Engineer",
    "Data Engineer",
    "Founding Engineer",
    "Founding Research Engineer",
    "Distinguished Engineer",
    "Executive Director",
    "Director of Research",
    "Head of IT",
    // real ATS title that cleared the Director pattern via "Technical"
    "Director, Technical Revenue Accounting",
  ];

  test.each(shouldFail)("rejects via exclude: %s", (title) => {
    expect(titlePassesPatterns(title, ALL)).toBe(false);
  });
});

describe("titlePassesPatterns — false positives blocked by include allowlist", () => {
  const shouldFail = [
    "Business Development Director - Real world Evidence & HEOR",
    "Business Development Director",
    "Head of People",
    "Head of HR",
    "VP of Sales",
    "VP of Marketing",
    "General Counsel",
    "Account Executive",
    "Regional Sales Manager",
    "Director of Clinical Operations",
    "Chief Medical Officer",
    // real ATS titles that matched the old unbounded "ai" alternative:
    // Aff(ai)rs, Camp(ai)gns, Ch(ai)n, Ret(ai)l
    "Director, Government Affairs & Public Policy",
    "Creative Director, Copy & Campaigns",
    "Director, Infrastructure Supply Chain Accounting",
    "Enterprise Sales Director - Majors, Retail",
  ];

  test.each(shouldFail)("rejects noise: %s", (title) => {
    expect(titlePassesPatterns(title, ALL)).toBe(false);
  });
});

describe("batch switching narrows every source, not just the searches", () => {
  // The ATS boards and Top Applicant take no keyword — these patterns are the
  // only thing standing between them and the digest. If a switched-off batch's
  // patterns stayed active, those two sources would keep delivering the old
  // batch's roles no matter what SEARCH_TITLES said.

  const aiEnablementRoles = [
    "Head of AI Enablement",
    "AI Enablement Engineer",
    "AI Enablement Engineering Lead",
    "Developer Productivity Engineer",
    "Engineering Effectiveness Manager",
    "Director of AI Transformation",
    "AI Center of Excellence Lead",
    "Head of AI Adoption",
    "AI Delivery Engineer",
  ];

  const execRoles = [
    "VP of Engineering",
    "CTO",
    "Chief Technology Officer",
    "Director of Engineering",
    "Head of Engineering",
    "Technical Program Manager",
    "Solutions Architect",
    "Forward Deployed Engineer",
    "Chief of Staff",
    "Developer Relations",
  ];

  test.each(aiEnablementRoles)("ai-enablement accepts: %s", (title) => {
    expect(titlePassesPatterns(title, AI)).toBe(true);
  });

  test.each(execRoles)(
    "ai-enablement rejects previous-batch role: %s",
    (title) => {
      expect(titlePassesPatterns(title, AI)).toBe(false);
    },
  );

  test.each(execRoles)("previous batch still accepts: %s", (title) => {
    expect(titlePassesPatterns(title, ALL)).toBe(true);
  });

  it("rejects everything when no batch is active", () => {
    const none = includePatternsFor({
      previous: false,
      "ai-enablement": false,
    });
    expect(none).toEqual([]);
    // An empty allowlist must not mean "allow all" — that would flood the
    // digest with every posting on every watched board.
    expect(titlePassesPatterns("VP of Engineering", none)).toBe(false);
    expect(titlePassesPatterns("Head of AI Enablement", none)).toBe(false);
  });
});

import { COMPANY_TARGETS } from "../config/boards";
import { geoLabel } from "../notify";

const SF = "San Francisco / Bay Area";
const US = "Remote US";

/**
 * Every source module routes its jobs into an email section by emitting a
 * `search` label that geoLabel() string-matches. Nothing type-checks that
 * relationship, and a label matching no rule lands silently in "Other" — the
 * job still appears, just in the wrong place, which is easy to never notice.
 * These tests are the only thing holding that contract.
 */
describe("COMPANY_TARGETS registry", () => {
  it("has unique names", () => {
    const names = COMPANY_TARGETS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("has unique ats+token pairs", () => {
    const keys = COMPANY_TARGETS.map((t) => `${t.ats}/${t.token}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test.each(COMPANY_TARGETS)(
    "$name: name is non-empty and free of '/' (geoLabel slices on it)",
    (target) => {
      expect(target.name.length).toBeGreaterThan(0);
      expect(target.name).not.toContain("/");
      expect(target.name.trim()).toBe(target.name);
    },
  );

  test.each(COMPANY_TARGETS)("$name: token is a non-empty slug", (target) => {
    expect(target.token).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("geoLabel routes every label the codebase emits", () => {
  test.each(COMPANY_TARGETS)(
    "$name ($geo) routes out of the Other bucket",
    (target) => {
      const expected = target.geo === "us" ? US : SF;
      expect(geoLabel(`Target/${target.name}`)).toBe(expected);
    },
  );

  // Mirrors the labels in DISCOVERY_SEARCHES. Kept as literals rather than
  // imported so a rename has to be made deliberately in both places.
  const searchLabels: [string, string][] = [
    ["Ashby/SF", SF],
    ["Wellfound/SF", SF],
    ["BuiltInSF/SF", SF],
    ["Web, US", US],
    ["Greenhouse/US", US],
    ["Lever/US", US],
    ["Levels/US", US],
    ["YC/US", US],
  ];

  test.each(searchLabels)("%s routes to %s", (label, expected) => {
    expect(geoLabel(label)).toBe(expected);
  });

  it("routes Top Applicant to its own section", () => {
    expect(geoLabel("Top Applicant")).toBe("Top Applicant");
  });

  it("falls back to Other for an unrecognised label", () => {
    expect(geoLabel("Something/Unmapped")).toBe("Other");
  });

  it("would have caught the old Web/US label falling into Other", () => {
    // Lowercased, "web/us" contains "/us" but geoLabel looks for ", us".
    // This is the bug the slot rename fixes; pinned so it cannot come back.
    expect(geoLabel("Web/US")).toBe("Other");
    expect(geoLabel("Web, US")).toBe(US);
  });

  it("does not drop a target into Other when the name is unknown", () => {
    // A stale label must degrade to a real section, not vanish into Other.
    expect(geoLabel("Target/NoSuchCompany")).toBe(SF);
  });
});

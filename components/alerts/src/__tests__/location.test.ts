import { isUsOrBayArea } from "../ats/location";

describe("isUsOrBayArea — keeps US and Bay Area postings", () => {
  // Every string below was returned verbatim by a live board during the
  // seeding pass, so these double as a record of the shapes providers emit.
  const keep = [
    "San Francisco, CA",
    "San Francisco",
    "San Francisco, CA; New York, NY",
    "New York City, NY; San Francisco, CA | New York City, NY",
    "United States",
    "Remote - California; San Francisco, California",
    "Remote - California",
    "Columbia, MD; Washington, DC",
    "Boston, MA, Dayton, OH",
    "Seattle, Washington",
    "North America",
    "US",
    "Remote (US)",
    "Remote - US",
    // ambiguous but worth surfacing
    "Remote",
    "",
  ];

  test.each(keep)("keeps: %s", (loc) => {
    expect(isUsOrBayArea(loc)).toBe(true);
  });
});

describe("isUsOrBayArea — drops foreign postings", () => {
  const drop = [
    "London, United Kingdom",
    "London, UK",
    "Munich, Germany",
    "Tokyo, Japan",
    "Singapore",
    "Madrid, Spain",
    "Bengaluru, India",
    "Bengaluru, India; Delhi, India; India; Mumbai, India",
    "Remote - India",
    "Berlin, Germany, Paris, France, Amsterdam, Netherlands, Munich, Germany, London, United Kingdom",
    "Europe",
    "Sydney, Australia",
    "Toronto, Ontario",
    "São Paulo, Brazil",
  ];

  test.each(drop)("drops: %s", (loc) => {
    expect(isUsOrBayArea(loc)).toBe(false);
  });
});

describe("isUsOrBayArea — state codes do not match foreign place names", () => {
  // The comma-anchored state-code rule is the easiest one to get wrong:
  // ", India" must not match IN, ", Delhi" must not match DE, and
  // ", Oregon" must not match OR before the spelled-out rule sees it.
  it("does not treat ', India' as Indiana", () => {
    expect(isUsOrBayArea("Bengaluru, India")).toBe(false);
  });

  it("does not treat ', Delhi' as Delaware", () => {
    expect(isUsOrBayArea("New Delhi, Delhi")).toBe(false);
  });

  it("still matches a real trailing state code", () => {
    expect(isUsOrBayArea("Indianapolis, IN")).toBe(true);
  });

  it("matches Oregon spelled out", () => {
    expect(isUsOrBayArea("Portland, Oregon")).toBe(true);
  });
});

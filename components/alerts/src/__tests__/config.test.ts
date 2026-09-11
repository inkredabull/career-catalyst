import { TIME_FRAME, THREE_DAYS, ONE_DAY, ONE_WEEK } from "../config/constants";
import { timeFrameToSeconds, timeFrameToCutoffMs } from "../clock";
import { SEARCH_TITLES, allIncludePatterns } from "../config/titles";
import { titlePassesPatterns } from "../filters";

describe("SEARCH_TITLES", () => {
  it("runs the active batch's titles", () => {
    expect(SEARCH_TITLES["AI Enablement"]).toBe(true);
    expect(SEARCH_TITLES["AI Adoption"]).toBe(true);
  });

  it("does not run titles from an inactive batch", () => {
    expect(SEARCH_TITLES["VP Engineering"]).toBe(false);
    expect(SEARCH_TITLES["CTO"]).toBe(false);
  });

  it("does not run an individually disabled title", () => {
    // LinkedIn returns an empty response for this phrase, so the query is
    // 4 API calls a run for nothing. The entry is kept, just switched off.
    expect(SEARCH_TITLES).toHaveProperty("AI Center of Excellence");
    expect(SEARCH_TITLES["AI Center of Excellence"]).toBe(false);
  });

  it("still matches the disabled title if another source surfaces it", () => {
    // Disabling the query must not blind the ATS and discovery paths to the
    // role — those filter on patterns, not on SEARCH_TITLES.
    expect(
      titlePassesPatterns("AI Center of Excellence Lead", allIncludePatterns()),
    ).toBe(true);
  });
});

describe("TIME_FRAME", () => {
  // timeFrameToSeconds falls back to 24h on anything unparseable, so a typo in
  // the constant would silently narrow every search back to a single day
  // instead of failing. Pin the parse, not just the string.
  it("parses to a real duration rather than hitting the 24h fallback", () => {
    const seconds = timeFrameToSeconds(TIME_FRAME);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).not.toBe(timeFrameToSeconds("garbage"));
  });

  it("is the three-day window", () => {
    expect(TIME_FRAME).toBe(THREE_DAYS);
    expect(timeFrameToSeconds(TIME_FRAME)).toBe(3 * 24 * 60 * 60);
  });

  it("sits between the one-day and one-week presets", () => {
    expect(timeFrameToSeconds(ONE_DAY)).toBeLessThan(
      timeFrameToSeconds(TIME_FRAME),
    );
    expect(timeFrameToSeconds(TIME_FRAME)).toBeLessThan(
      timeFrameToSeconds(ONE_WEEK),
    );
  });

  it("produces a cutoff three days back", () => {
    const now = Date.UTC(2026, 8, 10, 12, 0, 0);
    expect(timeFrameToCutoffMs(TIME_FRAME, now)).toBe(
      now - 3 * 24 * 60 * 60 * 1000,
    );
  });
});

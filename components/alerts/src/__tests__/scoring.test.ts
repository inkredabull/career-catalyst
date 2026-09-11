import { linkedInJobId, parseVerdict } from "../scoring";
import { matchingStopEntries } from "../seen";

describe("parseVerdict", () => {
  it("reads the standard trailing label", () => {
    expect(parseVerdict("1. Skills: 4 — good\n\nVerdict: 🟢")).toBe("🟢");
  });

  it("tolerates markdown around the label", () => {
    expect(parseVerdict("...\n\n**Verdict:** 🟡")).toBe("🟡");
  });

  it("prefers the anchored label over emoji used inline in the reasoning", () => {
    // The rubric itself describes 🔴 as a red flag, so an unanchored search
    // would return the first mention rather than the actual conclusion.
    const text = [
      "5. Company Culture: 2 — 🔴 red flag on in-office policy",
      "6. Lifestyle: 3 — 🟡 ambiguous on remote",
      "",
      "Verdict: 🟢",
    ].join("\n");
    expect(parseVerdict(text)).toBe("🟢");
  });

  it("falls back to a bare trailing label when the word is missing", () => {
    expect(parseVerdict("1. Skills: 4 — strong\n\n🟡")).toBe("🟡");
  });

  it("returns null when the model hedges instead of concluding", () => {
    // Verbatim tail of the response that produced a "?" in production.
    const text =
      "There is not enough information in this posting to conclude this " +
      "with a definitive verdict.**";
    expect(parseVerdict(text)).toBeNull();
  });

  it("returns null for an empty response", () => {
    expect(parseVerdict("")).toBeNull();
  });
});

describe("linkedInJobId", () => {
  it("extracts the id from a canonical job URL", () => {
    expect(linkedInJobId("https://www.linkedin.com/jobs/view/4466002563")).toBe(
      "4466002563",
    );
  });

  it("tolerates a trailing slash and query string", () => {
    expect(
      linkedInJobId("https://www.linkedin.com/jobs/view/4466002563/?refId=abc"),
    ).toBe("4466002563");
  });

  it("returns null for a non-job LinkedIn URL", () => {
    expect(linkedInJobId("https://www.linkedin.com/feed/")).toBeNull();
  });

  it("returns null for a non-LinkedIn URL", () => {
    expect(linkedInJobId("https://jobs.ashbyhq.com/openai/abc-123")).toBeNull();
  });
});

describe("matchingStopEntries", () => {
  // Mirrors index.ts isBlocked(), so the stop-list UI can name the entry
  // responsible for an exclusion rather than leaving it a mystery.
  const lists = {
    companies: ["Jobot", "Jobgether"],
    titles: ["AI Engineering & Enablement", "Analytics Engineering"],
  };

  it("names the title entry responsible for an exclusion", () => {
    expect(
      matchingStopEntries(
        lists,
        "Tebra",
        "Head of AI Engineering & Enablement",
      ),
    ).toEqual([{ type: "title", value: "AI Engineering & Enablement" }]);
  });

  it("names the company entry responsible", () => {
    expect(matchingStopEntries(lists, "Jobot", "VP of Engineering")).toEqual([
      { type: "company", value: "Jobot" },
    ]);
  });

  it("matches case-insensitively on substrings, as isBlocked does", () => {
    expect(
      matchingStopEntries(
        lists,
        "JOBOT Inc",
        "director of ANALYTICS engineering",
      ),
    ).toHaveLength(2);
  });

  it("returns nothing when a job is not blocked", () => {
    expect(
      matchingStopEntries(lists, "Anthropic", "Head of AI Enablement"),
    ).toEqual([]);
  });
});

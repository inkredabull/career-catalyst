import { linkedInJobId } from "../scoring";
import { matchingStopEntries } from "../seen";

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

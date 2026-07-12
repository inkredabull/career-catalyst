import {
  filterUnseen,
  markAsSeen,
  pruneSeen,
  companyTitleKey,
  SEEN_TTL_MS,
} from "../seen";
import { deduplicateByCompanyTitle, mergeResults } from "../index";
import { SearchResults } from "../linkedin";

const job = (id: string): SearchResults => ({
  [id]: {
    id,
    company: "Acme",
    title: "CTO",
    url: `https://linkedin.com/jobs/view/${id}`,
    search: "test",
  },
});

const jobs = (...ids: string[]): SearchResults =>
  ids.reduce((acc, id) => ({ ...acc, ...job(id) }), {} as SearchResults);

describe("filterUnseen", () => {
  it("returns all results when seen map is empty", () => {
    expect(filterUnseen(jobs("1", "2"), {})).toEqual(jobs("1", "2"));
  });

  it("excludes ids present in seen map", () => {
    const seen = { "1": Date.now() };
    expect(filterUnseen(jobs("1", "2"), seen)).toEqual(jobs("2"));
  });

  it("returns empty object when all results are already seen", () => {
    const seen = { "1": Date.now(), "2": Date.now() };
    expect(filterUnseen(jobs("1", "2"), seen)).toEqual({});
  });

  it("returns empty object when results are empty", () => {
    expect(filterUnseen({}, { "1": Date.now() })).toEqual({});
  });

  it("excludes a job whose company+title key is in seen (cross-run repost)", () => {
    const repost: SearchResults = {
      "999": {
        id: "999",
        company: "Acme",
        title: "CTO",
        url: "https://linkedin.com/jobs/view/999",
        search: "test",
      },
    };
    const seen = { "ct:acme|||cto": Date.now() };
    expect(filterUnseen(repost, seen)).toEqual({});
  });

  it("keeps a job that shares a title but differs in company", () => {
    const result: SearchResults = {
      "5": {
        id: "5",
        company: "OtherCo",
        title: "CTO",
        url: "https://linkedin.com/jobs/view/5",
        search: "test",
      },
    };
    const seen = { "ct:acme|||cto": Date.now() };
    expect(filterUnseen(result, seen)).toEqual(result);
  });
});

describe("markAsSeen", () => {
  it("adds new ids with the provided timestamp", () => {
    const now = 1000000;
    const result = markAsSeen(jobs("1", "2"), {}, now);
    expect(result["1"]).toBe(now);
    expect(result["2"]).toBe(now);
  });

  it("preserves existing entries", () => {
    const existing = { "99": 500 };
    const result = markAsSeen(jobs("1"), existing, 1000);
    expect(result["99"]).toBe(500);
    expect(result["1"]).toBe(1000);
  });

  it("updates timestamp for a previously seen id", () => {
    const result = markAsSeen(jobs("1"), { "1": 100 }, 999);
    expect(result["1"]).toBe(999);
  });

  it("does not mutate the original seen map", () => {
    const seen = { "99": 500 };
    markAsSeen(jobs("1"), seen, 1000);
    expect(seen).toEqual({ "99": 500 });
  });

  it("also records the company+title key", () => {
    const now = 1000000;
    const result = markAsSeen(jobs("1"), {}, now);
    expect(result["ct:acme|||cto"]).toBe(now);
  });
});

describe("companyTitleKey", () => {
  it("produces a stable lowercase key", () => {
    const job = {
      id: "1",
      company: "Jobright.ai",
      title: "Head of AI",
      url: "",
      search: "",
    };
    expect(companyTitleKey(job)).toBe("ct:jobright.ai|||head of ai");
  });
});

describe("pruneSeen", () => {
  it("keeps entries within TTL", () => {
    const now = Date.now();
    const seen = { "1": now - 1000 };
    expect(pruneSeen(seen, now)).toEqual(seen);
  });

  it("removes entries older than TTL", () => {
    const now = Date.now();
    const seen = { "1": now - SEEN_TTL_MS - 1 };
    expect(pruneSeen(seen, now)).toEqual({});
  });

  it("keeps recent entries and drops stale ones", () => {
    const now = Date.now();
    const seen = {
      fresh: now - 1000,
      stale: now - SEEN_TTL_MS - 1,
    };
    expect(pruneSeen(seen, now)).toEqual({ fresh: now - 1000 });
  });

  it("returns empty object for empty input", () => {
    expect(pruneSeen({}, Date.now())).toEqual({});
  });
});

describe("deduplicateByCompanyTitle", () => {
  const makeJob = (
    id: string,
    company: string,
    title: string,
    search = "test",
  ): SearchResults => ({
    [id]: { id, company, title, url: `https://example.com/${id}`, search },
  });

  it("keeps unique company+title combinations", () => {
    const results = {
      ...makeJob("1", "Acme", "CTO"),
      ...makeJob("2", "Globex", "VP Engineering"),
    };
    expect(Object.keys(deduplicateByCompanyTitle(results))).toHaveLength(2);
  });

  it("removes duplicate company+title from a second source", () => {
    const results = {
      ...makeJob("url-a", "FutureSight", "CTO", "Greenhouse/US"),
      ...makeJob("url-b", "FutureSight", "CTO", "Lever/US"),
      ...makeJob("url-c", "FutureSight", "CTO", "BuiltInSF/SF"),
    };
    const deduped = deduplicateByCompanyTitle(results);
    expect(Object.keys(deduped)).toHaveLength(1);
    expect(Object.values(deduped)[0].id).toBe("url-a");
  });

  it("is case-insensitive", () => {
    const results = {
      ...makeJob("1", "Acme Corp", "vp engineering"),
      ...makeJob("2", "ACME CORP", "VP Engineering"),
    };
    expect(Object.keys(deduplicateByCompanyTitle(results))).toHaveLength(1);
  });

  it("returns empty object for empty input", () => {
    expect(deduplicateByCompanyTitle({})).toEqual({});
  });
});

describe("mergeResults", () => {
  it("merges two result sets", () => {
    const a = {
      "1": { id: "1", company: "A", title: "T", url: "", search: "" },
    };
    const b = {
      "2": { id: "2", company: "B", title: "T", url: "", search: "" },
    };
    expect(Object.keys(mergeResults(a, b))).toEqual(["1", "2"]);
  });

  it("second set wins on key collision", () => {
    const a = {
      "1": { id: "1", company: "Old", title: "T", url: "", search: "" },
    };
    const b = {
      "1": { id: "1", company: "New", title: "T", url: "", search: "" },
    };
    expect(mergeResults(a, b)["1"].company).toBe("New");
  });
});

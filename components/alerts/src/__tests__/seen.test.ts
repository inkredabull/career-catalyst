import { filterUnseen, markAsSeen, pruneSeen, SEEN_TTL_MS } from "../seen";
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
});

describe("markAsSeen", () => {
  it("adds new ids with the provided timestamp", () => {
    const now = 1000000;
    const result = markAsSeen(jobs("1", "2"), {}, now);
    expect(result).toEqual({ "1": now, "2": now });
  });

  it("preserves existing entries", () => {
    const existing = { "99": 500 };
    const result = markAsSeen(jobs("1"), existing, 1000);
    expect(result).toEqual({ "99": 500, "1": 1000 });
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

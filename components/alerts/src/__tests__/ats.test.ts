import { normalizeGreenhouse } from "../ats/greenhouse";
import { normalizeLever } from "../ats/lever";
import { normalizeAshby } from "../ats/ashby";
import { atsJobToResult, dedupeByRequisition, selectFreshJobs } from "../ats";
import { AtsJob } from "../ats/types";
import { CompanyTarget } from "../config/boards";

import greenhouseFixture from "./fixtures/greenhouse.json";
import leverFixture from "./fixtures/lever.json";
import ashbyFixture from "./fixtures/ashby.json";

const TARGET: CompanyTarget = {
  name: "Anthropic",
  ats: "greenhouse",
  token: "anthropic",
  geo: "sf",
};

function job(overrides: Partial<AtsJob> = {}): AtsJob {
  return {
    externalId: "1",
    title: "VP of Engineering",
    url: "https://example.com/jobs/1",
    location: "San Francisco, CA",
    publishedAtMs: 1_700_000_000_000,
    dedupKey: "REQ-1",
    ...overrides,
  };
}

describe("normalizeGreenhouse", () => {
  const jobs = normalizeGreenhouse(greenhouseFixture);

  it("maps every job in the fixture", () => {
    expect(jobs).toHaveLength(4);
  });

  it("maps title, url, and nested location.name", () => {
    const fde = jobs.find((j) => j.location === "United States");
    expect(fde).toBeDefined();
    expect(fde!.title).toBe("AI Engineer - FDE (Forward Deployed Engineer)");
    // absolute_url is whatever the board is configured to point at — Greenhouse
    // lets companies host it on their own domain, so don't assume greenhouse.io.
    expect(fde!.url).toMatch(/^https:\/\//);
  });

  it("dates from first_published, not updated_at", () => {
    expect(jobs[0].publishedAtMs).toBe(Date.parse("2026-06-29T02:02:50-04:00"));
  });

  it("uses requisition_id as the dedup key", () => {
    expect(jobs[0].dedupKey).toBe("FEQ327R203");
    expect(jobs[1].dedupKey).toBe("FEQ327R203");
  });
});

describe("normalizeLever", () => {
  const jobs = normalizeLever(leverFixture);

  it("accepts a bare top-level array (no `jobs` envelope)", () => {
    expect(Array.isArray(leverFixture)).toBe(true);
    expect(jobs).toHaveLength(3);
  });

  it("reads the title from `text`, not `title`", () => {
    expect(jobs[0].title).toBe("Aerostructures Design Engineer II (R4953)");
  });

  it("treats createdAt as epoch milliseconds verbatim", () => {
    expect(jobs[0].publishedAtMs).toBe(1779920530389);
  });

  it("reads location from categories.location", () => {
    expect(jobs[0].location).toBe("Seattle, Washington");
  });
});

describe("normalizeAshby", () => {
  const jobs = normalizeAshby(ashbyFixture);

  it("maps title, jobUrl, location and publishedAt", () => {
    expect(jobs).toHaveLength(3);
    expect(jobs[0].title).toBe("Senior / Staff Fullstack Engineer");
    expect(jobs[0].url).toMatch(/^https:\/\/jobs\.ashbyhq\.com\/linear\//);
    expect(jobs[0].location).toBe("Europe");
    expect(jobs[0].publishedAtMs).toBe(
      Date.parse("2021-04-27T20:13:45.158+00:00"),
    );
  });

  it("drops unlisted postings", () => {
    const raw = {
      jobs: [
        {
          id: "a",
          title: "VP of Engineering",
          jobUrl: "https://jobs.ashbyhq.com/x/a",
          location: "SF",
          isListed: false,
          publishedAt: "2026-01-01T00:00:00.000+00:00",
        },
      ],
    };
    expect(normalizeAshby(raw)).toEqual([]);
  });

  it("joins secondary locations", () => {
    const raw = {
      jobs: [
        {
          id: "a",
          title: "VP of Engineering",
          jobUrl: "https://jobs.ashbyhq.com/x/a",
          location: "San Francisco",
          secondaryLocations: [
            { location: "New York" },
            { location: "Remote" },
          ],
          isListed: true,
          publishedAt: "2026-01-01T00:00:00.000+00:00",
        },
      ],
    };
    expect(normalizeAshby(raw)[0].location).toBe(
      "San Francisco, New York, Remote",
    );
  });
});

describe("normalizers are defensive against junk payloads", () => {
  const cases: unknown[] = [
    null,
    undefined,
    {},
    { jobs: "nope" },
    { jobs: [null, 3, "x"] },
    [{ noTitle: true }],
    "a string",
  ];

  for (const normalize of [
    normalizeGreenhouse,
    normalizeLever,
    normalizeAshby,
  ]) {
    test.each(cases.map((c) => [JSON.stringify(c) ?? "undefined", c]))(
      `${normalize.name} returns [] for %s`,
      (_label, payload) => {
        expect(() => normalize(payload)).not.toThrow();
        expect(normalize(payload)).toEqual([]);
      },
    );
  }

  it("skips individual jobs missing a title or url", () => {
    const raw = {
      jobs: [
        { id: 1, title: "VP of Engineering" }, // no absolute_url
        { id: 2, absolute_url: "https://x/2" }, // no title
      ],
    };
    expect(normalizeGreenhouse(raw)).toEqual([]);
  });
});

describe("whitespace normalization", () => {
  it("collapses non-breaking spaces so dedup keys match the plain form", () => {
    const raw = {
      jobs: [
        {
          id: 1,
          title: "Forward-Deployed Engineer\u00a0",
          absolute_url: "https://x/1",
          location: { name: "San\u00a0Francisco,  CA" },
          first_published: "2026-01-01T00:00:00-00:00",
        },
      ],
    };
    const [j] = normalizeGreenhouse(raw);
    expect(j.title).toBe("Forward-Deployed Engineer");
    expect(j.location).toBe("San Francisco, CA");
  });
});

describe("dedupeByRequisition", () => {
  it("collapses one requisition fanned across locations, merging them", () => {
    const merged = dedupeByRequisition([
      job({ url: "https://x/1", location: "Tokyo, Japan", dedupKey: "R1" }),
      job({ url: "https://x/2", location: "Osaka, Japan", dedupKey: "R1" }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].location).toBe("Tokyo, Japan, Osaka, Japan");
  });

  it("keeps distinct requisitions apart", () => {
    const merged = dedupeByRequisition([
      job({ dedupKey: "R1" }),
      job({ dedupKey: "R2" }),
    ]);
    expect(merged).toHaveLength(2);
  });

  it("keeps the earliest publish date for a merged requisition", () => {
    const merged = dedupeByRequisition([
      job({ dedupKey: "R1", publishedAtMs: 2000 }),
      job({ dedupKey: "R1", publishedAtMs: 1000 }),
    ]);
    expect(merged[0].publishedAtMs).toBe(1000);
  });

  it("does not mutate its input", () => {
    const input = [
      job({ dedupKey: "R1", location: "Tokyo" }),
      job({ dedupKey: "R1", location: "Osaka" }),
    ];
    dedupeByRequisition(input);
    expect(input[0].location).toBe("Tokyo");
  });
});

describe("selectFreshJobs", () => {
  const CUTOFF = 1_000_000;

  it("keeps a job published exactly at the cutoff", () => {
    expect(
      selectFreshJobs([job({ publishedAtMs: CUTOFF })], CUTOFF),
    ).toHaveLength(1);
  });

  it("drops a job published before the cutoff", () => {
    expect(
      selectFreshJobs([job({ publishedAtMs: CUTOFF - 1 })], CUTOFF),
    ).toEqual([]);
  });

  it("drops jobs with no parseable publish date", () => {
    expect(selectFreshJobs([job({ publishedAtMs: 0 })], CUTOFF)).toEqual([]);
  });

  it("applies the title allowlist", () => {
    const fresh = { publishedAtMs: CUTOFF + 1 };
    expect(
      selectFreshJobs(
        [job({ ...fresh, title: "Regional Sales Manager" })],
        CUTOFF,
      ),
    ).toEqual([]);
    expect(
      selectFreshJobs(
        [job({ ...fresh, title: "Head of Engineering" })],
        CUTOFF,
      ),
    ).toHaveLength(1);
  });
});

describe("atsJobToResult", () => {
  it("emits the Target/{name} label geoLabel() depends on", () => {
    expect(atsJobToResult(job(), TARGET).search).toBe("Target/Anthropic");
  });

  it("keys off the url and uses the registry's canonical company name", () => {
    const r = atsJobToResult(job({ url: "https://x/9" }), TARGET);
    expect(r.id).toBe("https://x/9");
    expect(r.url).toBe("https://x/9");
    expect(r.company).toBe("Anthropic");
    expect(r.source).toBe("Anthropic");
  });

  it("omits location entirely rather than setting it undefined", () => {
    const r = atsJobToResult(job({ location: "" }), TARGET);
    expect("location" in r).toBe(false);
  });
});

import {
  buildDiscoveryQuery,
  buildExaBody,
  parseResultTitle,
  passesPathFilter,
  shouldRunDiscovery,
} from "../discovery";

describe("parseResultTitle", () => {
  it('parses "TITLE at COMPANY | SITE" format', () => {
    const r = parseResultTitle("VP Engineering at Stripe | Ashby");
    expect(r).toEqual({ title: "VP Engineering", company: "Stripe" });
  });

  it('parses "TITLE at COMPANY" without site suffix', () => {
    const r = parseResultTitle("Head of Engineering at Acme");
    expect(r).toEqual({ title: "Head of Engineering", company: "Acme" });
  });

  it('parses "TITLE - COMPANY | SITE" format', () => {
    const r = parseResultTitle("Director of Engineering - Figma | Wellfound");
    expect(r).toEqual({ title: "Director of Engineering", company: "Figma" });
  });

  it("parses em-dash separator", () => {
    const r = parseResultTitle("CTO – Some Startup");
    expect(r).toEqual({ title: "CTO", company: "Some Startup" });
  });

  it("strips site suffix when no company separator found", () => {
    const r = parseResultTitle("CTO | Wellfound");
    expect(r).toEqual({ title: "CTO", company: "" });
  });

  it("returns full string as title when no pattern matches", () => {
    const r = parseResultTitle("Head of Engineering");
    expect(r).toEqual({ title: "Head of Engineering", company: "" });
  });

  it("handles multi-word company names", () => {
    const r = parseResultTitle("Head of AI Engineering at Scale AI | Ashby");
    expect(r).toEqual({ title: "Head of AI Engineering", company: "Scale AI" });
  });

  it('parses "TITLE @ COMPANY | SITE" format (Ashby)', () => {
    const r = parseResultTitle("Head of Technical Recruiting @ Notion | Jobs");
    expect(r).toEqual({
      title: "Head of Technical Recruiting",
      company: "Notion",
    });
  });

  it('skips leading "Jobs" noise segment', () => {
    const r = parseResultTitle("Jobs | Chief of Staff @ Superpower");
    expect(r).toEqual({ title: "Chief of Staff", company: "Superpower" });
  });

  it('parses "TITLE @ COMPANY" without pipe segments', () => {
    const r = parseResultTitle("VP Engineering @ Stripe");
    expect(r).toEqual({ title: "VP Engineering", company: "Stripe" });
  });

  it('parses "COMPANY hiring TITLE in LOCATION" format', () => {
    const r = parseResultTitle(
      "Arlo Hotels hiring Director of Engineering in Washington, DC",
    );
    expect(r).toEqual({
      title: "Director of Engineering",
      company: "Arlo Hotels",
    });
  });

  it('parses "COMPANY hiring TITLE" without location', () => {
    const r = parseResultTitle("Acme Corp hiring VP Engineering | LinkedIn");
    expect(r).toEqual({ title: "VP Engineering", company: "Acme Corp" });
  });

  it("extracts company from remaining segment stripping Careers suffix", () => {
    const r = parseResultTitle(
      "Senior Forward Deployed Engineer, Cloud Applied AI | Google Careers",
    );
    expect(r).toEqual({
      title: "Senior Forward Deployed Engineer, Cloud Applied AI",
      company: "Google",
    });
  });

  it("extracts company from remaining segment without suffix", () => {
    const r = parseResultTitle("Director of Engineering | Stripe");
    expect(r).toEqual({ title: "Director of Engineering", company: "Stripe" });
  });
});

describe("parseResultTitle — real Exa result shapes", () => {
  // Every raw string below was returned verbatim by Exa during the migration.

  it("inverts Lever titles, which are {Company} - {Title}", () => {
    const r = parseResultTitle("Fig - VP, Head of Engineering", {
      companyFirst: true,
    });
    expect(r).toEqual({ title: "VP, Head of Engineering", company: "Fig" });
  });

  it("without companyFirst a Lever title parses to company-as-title", () => {
    // Documents exactly why the flag exists: "Fig" fails titlePassesPatterns,
    // so without it the entire Lever slot silently returns nothing.
    expect(parseResultTitle("Fig - VP, Head of Engineering").title).toBe("Fig");
  });

  it("strips a ' - Jobs' suffix that the pipe-split never sees", () => {
    const r = parseResultTitle(
      "Platform Engineer, Revenue Operations @ Nooks - Jobs",
    );
    expect(r).toEqual({
      title: "Platform Engineer, Revenue Operations",
      company: "Nooks",
    });
  });

  it("strips the Greenhouse 'Job Application for' prefix", () => {
    const r = parseResultTitle("Job Application for VP of Engineering at GWI");
    expect(r).toEqual({ title: "VP of Engineering", company: "GWI" });
  });

  it("treats Levels.fyi as noise so the company is not the site name", () => {
    const r = parseResultTitle("VP of Engineering | Qdrant | Levels.fyi");
    expect(r).toEqual({ title: "VP of Engineering", company: "Qdrant" });
  });

  it("parses a YC title", () => {
    const r = parseResultTitle("VP of Engineering at Simbie AI | Y Combinator");
    expect(r).toEqual({ title: "VP of Engineering", company: "Simbie AI" });
  });

  it("parses a BuiltIn title", () => {
    const r = parseResultTitle(
      "VP of Engineering - Heliux | Built In San Francisco",
    );
    expect(r).toEqual({ title: "VP of Engineering", company: "Heliux" });
  });

  it("trims Wellfound's bullet-separated location metadata off the company", () => {
    const r = parseResultTitle(
      "VP of Engineering at Feathr • Gainesville • Remote (Work from Home) | Wellfound",
    );
    expect(r).toEqual({ title: "VP of Engineering", company: "Feathr" });
  });
});

describe("passesPathFilter", () => {
  const builtIn = "https://www.builtinsf.com/job/vp-engineering/10841075";
  const levels = "https://www.levels.fyi/jobs?jobId=124987660698559174";

  it("keeps BuiltIn's singular /job/ path", () => {
    expect(passesPathFilter(builtIn, ["/job/"])).toBe(true);
  });

  it("a /jobs/ prefix would drop every BuiltIn result", () => {
    expect(passesPathFilter(builtIn, ["/jobs/"])).toBe(false);
  });

  it("keeps Levels.fyi, which puts the id in a query string", () => {
    expect(passesPathFilter(levels, ["/jobs"])).toBe(true);
    expect(passesPathFilter(levels, ["/jobs/"])).toBe(false);
  });

  it("keeps a YC company job page", () => {
    const url = "https://www.ycombinator.com/companies/postal/jobs/4LDHfDt-cto";
    expect(passesPathFilter(url, ["/companies/"])).toBe(true);
  });

  it("drops a Hacker News thread leaking in via the ycombinator.com domain", () => {
    const url = "https://news.ycombinator.com/item?id=1";
    expect(passesPathFilter(url, ["/companies/"])).toBe(false);
  });

  it("passes everything when no prefixes are configured", () => {
    expect(passesPathFilter("https://example.com/anything")).toBe(true);
    expect(passesPathFilter("https://example.com/anything", [])).toBe(true);
  });

  it("rejects an unparseable url rather than throwing", () => {
    expect(passesPathFilter("not a url", ["/job/"])).toBe(false);
  });
});

describe("buildDiscoveryQuery", () => {
  it("uses plain language, not Google OR syntax", () => {
    const q = buildDiscoveryQuery(["CTO", "VP Engineering"]);
    expect(q).toBe("CTO, VP Engineering job opening");
    expect(q).not.toContain(" OR ");
    expect(q).not.toContain('"');
  });

  it("appends a location hint when the slot has one", () => {
    expect(buildDiscoveryQuery(["CTO"], "San Francisco")).toBe(
      "CTO job opening in San Francisco",
    );
  });
});

describe("buildExaBody", () => {
  const body = buildExaBody(
    { label: "YC/US", source: "Y Combinator", includeDomains: ["a.com"] },
    "q",
  );

  it("omits contents, which would cost extra credits", () => {
    expect(body).not.toHaveProperty("contents");
  });

  it("omits startPublishedDate, which fabricates dates and hurts relevance", () => {
    expect(body).not.toHaveProperty("startPublishedDate");
  });

  it("stays inside the flat-rate result tier", () => {
    expect(body["numResults"]).toBeLessThanOrEqual(10);
  });

  it("omits domain keys entirely when the slot sets none", () => {
    const bare = buildExaBody({ label: "Web, US", source: "Google" }, "q");
    expect(bare).not.toHaveProperty("includeDomains");
    expect(bare).not.toHaveProperty("excludeDomains");
  });
});

describe("shouldRunDiscovery", () => {
  const at = (hourUtc: number) =>
    new Date(Date.UTC(2026, 8, 10, hourUtc, 0, 0));

  it("runs on 3 of the 6 daily cron ticks", () => {
    const cronHours = [0, 4, 8, 12, 16, 20];
    expect(cronHours.filter((h) => shouldRunDiscovery(at(h)))).toEqual([
      0, 8, 16,
    ]);
  });
});

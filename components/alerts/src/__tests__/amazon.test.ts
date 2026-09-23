import { amazonJobToResult, buildAmazonUrl, isFreshAmazonJob } from "../amazon";
import { geoLabel } from "../notify";

const job = {
  id_icims: "10558313",
  title: "Head of AI Enablement",
  job_path: "/en/jobs/10558313/head-of-ai-enablement",
  posted_date: "September 23, 2026",
  normalized_location: "Seattle, Washington, USA",
};

describe("buildAmazonUrl", () => {
  it("searches US postings, newest first", () => {
    const url = new URL(buildAmazonUrl("AI Enablement"));
    expect(url.pathname).toBe("/en/search.json");
    expect(url.searchParams.get("base_query")).toBe("AI Enablement");
    expect(url.searchParams.get("country")).toBe("USA");
    expect(url.searchParams.get("sort")).toBe("recent");
  });
});

describe("amazonJobToResult", () => {
  it("maps onto the JobResult shape with an absolute URL as the id", () => {
    expect(amazonJobToResult(job)).toEqual({
      id: "https://www.amazon.jobs/en/jobs/10558313/head-of-ai-enablement",
      company: "Amazon",
      title: "Head of AI Enablement",
      url: "https://www.amazon.jobs/en/jobs/10558313/head-of-ai-enablement",
      search: "Amazon, US",
      source: "Amazon",
      location: "Seattle, Washington, USA",
    });
  });

  it("routes its search label out of the Other bucket", () => {
    expect(geoLabel(amazonJobToResult(job).search)).toBe("Remote US");
  });
});

describe("isFreshAmazonJob", () => {
  const now = Date.parse("2026-09-23T12:00:00Z");
  const cutoff = now - 3 * 86_400_000;

  it("keeps a posting inside the window", () => {
    expect(isFreshAmazonJob(job, cutoff)).toBe(true);
  });

  it("drops a posting older than the window", () => {
    expect(
      isFreshAmazonJob({ ...job, posted_date: "September 1, 2026" }, cutoff),
    ).toBe(false);
  });

  it("drops a posting with a missing or unparseable date", () => {
    expect(isFreshAmazonJob({ ...job, posted_date: undefined }, cutoff)).toBe(
      false,
    );
    expect(isFreshAmazonJob({ ...job, posted_date: "soon" }, cutoff)).toBe(
      false,
    );
  });
});

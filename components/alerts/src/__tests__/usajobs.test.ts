import {
  usajobsItemToResult,
  fetchUsajobsResults,
  buildSearchUrl,
} from "../usajobs";
import { ENV } from "../config/settings";

describe("usajobsItemToResult", () => {
  it("maps a matching descriptor onto the JobResult shape", () => {
    const result = usajobsItemToResult({
      MatchedObjectDescriptor: {
        PositionTitle: "AI Enablement Lead",
        PositionURI: "https://www.usajobs.gov/job/123456789",
        OrganizationName: "Department of Veterans Affairs",
        PositionLocationDisplay: "Washington, District of Columbia",
        PublicationStartDate: "2026-09-15",
      },
    });

    expect(result).toEqual({
      id: "https://www.usajobs.gov/job/123456789",
      company: "Department of Veterans Affairs",
      title: "AI Enablement Lead",
      url: "https://www.usajobs.gov/job/123456789",
      search: "USAJOBS",
      source: "USAJOBS",
      location: "Washington, District of Columbia",
    });
  });

  it("omits location when the descriptor has none", () => {
    const result = usajobsItemToResult({
      MatchedObjectDescriptor: {
        PositionTitle: "AI Transformation Advisor",
        PositionURI: "https://www.usajobs.gov/job/987654321",
        OrganizationName: "General Services Administration",
      },
    });

    expect(result.location).toBeUndefined();
  });
});

describe("fetchUsajobsResults — degrade path", () => {
  const originalKey = process.env[ENV.USAJOBS_API_KEY];
  const originalUa = process.env[ENV.USAJOBS_USER_AGENT];

  afterEach(() => {
    if (originalKey === undefined) delete process.env[ENV.USAJOBS_API_KEY];
    else process.env[ENV.USAJOBS_API_KEY] = originalKey;
    if (originalUa === undefined) delete process.env[ENV.USAJOBS_USER_AGENT];
    else process.env[ENV.USAJOBS_USER_AGENT] = originalUa;
  });

  it("returns an empty result set instead of throwing when the API key is unset", async () => {
    delete process.env[ENV.USAJOBS_API_KEY];
    process.env[ENV.USAJOBS_USER_AGENT] = "anthony@bluxomelabs.com";

    await expect(fetchUsajobsResults("24h")).resolves.toEqual({});
  });

  it("returns an empty result set instead of throwing when the user agent is unset", async () => {
    process.env[ENV.USAJOBS_API_KEY] = "some-key";
    delete process.env[ENV.USAJOBS_USER_AGENT];

    await expect(fetchUsajobsResults("24h")).resolves.toEqual({});
  });
});

describe("buildSearchUrl", () => {
  it("asks for the time window, newest first", () => {
    const url = new URL(buildSearchUrl("r259200", 2));
    expect(url.searchParams.get("DatePosted")).toBe("3");
    expect(url.searchParams.get("SortField")).toBe("opendate");
    expect(url.searchParams.get("SortDirection")).toBe("desc");
    expect(url.searchParams.get("Page")).toBe("2");
  });

  it("clamps DatePosted to the API's 60-day maximum", () => {
    const url = new URL(buildSearchUrl("r31536000", 1));
    expect(url.searchParams.get("DatePosted")).toBe("60");
  });
});

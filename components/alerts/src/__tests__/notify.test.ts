import { formatEntry, sourceLine } from "../notify";
import { JobResult } from "../linkedin";

const BASE_URL = "https://alerts.example.com";

function makeJob(overrides: Partial<JobResult> = {}): JobResult {
  return {
    id: "123",
    company: "Acme",
    title: "VP of Engineering",
    url: "https://www.linkedin.com/jobs/view/123",
    search: "VP of Engineering",
    source: "LinkedIn",
    ...overrides,
  };
}

describe("formatEntry", () => {
  it("includes the job URL in both text and html", () => {
    const job = makeJob();
    const { text, html } = formatEntry(job, BASE_URL);
    expect(text).toContain(job.url);
    expect(html).toContain(job.url);
  });

  it("includes the judgment in both text and html", () => {
    const job = makeJob({ judgment: "🟢" });
    const { text, html } = formatEntry(job, BASE_URL);
    expect(text).toContain("🟢");
    expect(html).toContain("🟢");
  });

  it("defaults judgment to ? when not set", () => {
    const { text, html } = formatEntry(makeJob(), BASE_URL);
    expect(text).toContain("[?]");
    expect(html).toContain("?");
  });

  it("includes company and title in both formats", () => {
    const job = makeJob();
    const { text, html } = formatEntry(job, BASE_URL);
    expect(text).toContain(job.company);
    expect(text).toContain(job.title);
    expect(html).toContain(job.company);
    expect(html).toContain(job.title);
  });

  it("includes block links for company and title", () => {
    const job = makeJob();
    const { html } = formatEntry(job, BASE_URL);
    expect(html).toContain(
      `/api/block?type=company&value=${encodeURIComponent(job.company)}`,
    );
    expect(html).toContain(
      `/api/block?type=title&value=${encodeURIComponent(job.title)}`,
    );
  });

  it("includes score link in both text and html", () => {
    const job = makeJob({ id: "abc123" });
    const { text, html } = formatEntry(job, BASE_URL);
    expect(text).toContain("/api/score?id=abc123");
    expect(html).toContain("/api/score?id=abc123");
  });

  it("includes track link pointing to localhost:3000/extract with job url", () => {
    const job = makeJob();
    const { text, html } = formatEntry(job, BASE_URL);
    const expected = `http://localhost:3000/extract?url=${encodeURIComponent(job.url)}`;
    expect(text).toContain(expected);
    expect(html).toContain(expected);
  });

  it("renders location and info when present", () => {
    const job = makeJob({ location: "Remote", info: "$200K/yr" });
    const { text, html } = formatEntry(job, BASE_URL);
    expect(text).toContain("Remote");
    expect(text).toContain("$200K/yr");
    expect(html).toContain("Remote");
    expect(html).toContain("$200K/yr");
  });
});

describe("sourceLine", () => {
  it("shows search and source for regular LinkedIn results", () => {
    expect(sourceLine("VP of Engineering", "LinkedIn")).toBe(
      "VP of Engineering · LinkedIn",
    );
  });

  it("shows source only for Top Applicant (no redundant label)", () => {
    expect(sourceLine("Top Applicant", "LinkedIn (Top Applicant)")).toBe(
      "LinkedIn (Top Applicant)",
    );
  });

  it("shows source only when source already contains Top Applicant", () => {
    expect(sourceLine("anything", "LinkedIn (Top Applicant)")).toBe(
      "LinkedIn (Top Applicant)",
    );
  });
});

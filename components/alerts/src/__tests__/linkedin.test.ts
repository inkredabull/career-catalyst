import { extractApplicantCount } from "../linkedin";

describe("extractApplicantCount", () => {
  it("returns undefined for null/undefined", () => {
    expect(extractApplicantCount(null)).toBeUndefined();
    expect(extractApplicantCount(undefined)).toBeUndefined();
  });

  it("returns undefined for empty array", () => {
    expect(extractApplicantCount([])).toBeUndefined();
  });

  it('returns undefined for "Be an early applicant"', () => {
    expect(
      extractApplicantCount([{ text: "Be an early applicant" }]),
    ).toBeUndefined();
  });

  it("parses a plain count", () => {
    expect(extractApplicantCount([{ text: "47 applicants" }])).toBe(47);
  });

  it('parses "200+ applicants" as 201 so >200 check excludes it', () => {
    expect(extractApplicantCount([{ text: "200+ applicants" }])).toBe(201);
  });

  it("parses comma-formatted counts", () => {
    expect(extractApplicantCount([{ text: "1,234 applicants" }])).toBe(1234);
  });

  it("finds the count nested inside a complex object", () => {
    const insights = [
      {
        insightViewModel: {
          text: "87 applicants",
          accessibilityText: "87 applicants",
        },
      },
    ];
    expect(extractApplicantCount(insights)).toBe(87);
  });

  it("returns undefined when insights contain no applicant text", () => {
    expect(extractApplicantCount([{ text: "Easy Apply" }])).toBeUndefined();
  });
});

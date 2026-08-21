import { Resend } from "resend";
import { requireEnv, ENV } from "./config/settings";
import { JobResult, SearchResults } from "./linkedin";
import { COMPANY_TARGETS } from "./google";

const TRACK_BASE = process.env[ENV.NGROK_TUNNEL_URL] ?? "http://localhost:3000";

const JUDGMENT_COLOR: Record<string, string> = {
  "🟢": "#22c55e",
  "🟡": "#eab308",
  "🔴": "#ef4444",
};

export function sourceLine(search: string, source: string): string {
  const isTopApplicant = source.toLowerCase().includes("top applicant");
  return isTopApplicant ? source : `${search} · ${source}`;
}

export function formatEntry(
  r: JobResult,
  webAppUrl: string,
): { text: string; html: string } {
  const root = webAppUrl.replace(/\/$/, "");
  const banCo = `${root}/api/block?type=company&value=${encodeURIComponent(r.company)}`;
  const banTi = `${root}/api/block?type=title&value=${encodeURIComponent(r.title)}`;
  const scoreUrl = `${root}/api/score?id=${encodeURIComponent(r.id)}`;
  const trackUrl = `${TRACK_BASE}/extract?url=${encodeURIComponent(r.url)}`;
  const judgment = r.judgment ?? "?";
  const color = JUDGMENT_COLOR[judgment] ?? "#9ca3af";
  const meta = sourceLine(r.search, r.source ?? "LinkedIn");
  return {
    text: [
      `[${judgment}] ${r.company} — ${r.title}`,
      r.location,
      r.info,
      r.url,
      `Score: ${scoreUrl}`,
      `Track: ${trackUrl}`,
      meta,
      "---",
    ]
      .filter(Boolean)
      .join("\n"),
    html: `<div style="margin-bottom:14px;padding:10px 12px;border-left:4px solid ${color}">
      <div style="font-size:18px;font-weight:bold;margin-bottom:4px">${judgment} <a href="${r.url}" style="color:inherit;text-decoration:none">${r.company}</a> <a href="${banCo}" style="font-size:12px;text-decoration:none">👎</a></div>
      <div style="margin-bottom:4px">${r.title} <a href="${banTi}" style="font-size:12px;text-decoration:none">👎</a></div>
      ${r.location ? `<div style="color:#6b7280;font-size:13px">${r.location}</div>` : ""}
      ${r.info ? `<div style="font-size:13px">${r.info}</div>` : ""}
      <div style="font-size:13px;margin-top:4px"><a href="${r.url}">${r.url}</a> <br/> <a href="${scoreUrl}">Why ${judgment}?</a> · <a href="${trackUrl}">Track</a></div>
      <div style="font-size:12px;color:#6b7280;margin-top:2px">${meta}</div>
    </div>`,
  };
}

function geoLabel(search: string): string {
  const s = search.toLowerCase();
  if (s.includes("top applicant")) return "Top Applicant";
  if (s.startsWith("target/")) {
    const name = search.slice("target/".length);
    const target = COMPANY_TARGETS.find((t) => t.name === name);
    if (target?.geo === "us") return "Remote US";
    return "San Francisco / Bay Area";
  }
  if (
    s.includes(", us") ||
    s.includes(", united states") ||
    s.includes("greenhouse") ||
    s.includes("lever") ||
    s.includes("levels") ||
    s.includes("yc")
  )
    return "Remote US";
  if (
    s.includes("san francisco") ||
    s.includes("sf bay") ||
    s.includes("ashby") ||
    s.includes("wellfound") ||
    s.includes("indeed") ||
    s.includes("anthropic") ||
    s.includes("builtinsf")
  )
    return "San Francisco / Bay Area";
  return "Other";
}

const GEO_ORDER = [
  "Top Applicant",
  "San Francisco / Bay Area",
  "Remote US",
  "Other",
];

export async function notify(
  results: SearchResults,
  webAppUrl: string,
  durationMs?: number,
  logs?: string[],
  passJobs?: SearchResults,
): Promise<void> {
  const email = requireEnv(ENV.MY_EMAIL);
  const resend = new Resend(requireEnv(ENV.RESEND_API_KEY));

  // Group by geography
  const groups = new Map<string, JobResult[]>();
  for (const r of Object.values(results)) {
    const geo = geoLabel(r.search);
    if (!groups.has(geo)) groups.set(geo, []);
    groups.get(geo)!.push(r);
  }

  const textSections: string[] = [];
  const htmlSections: string[] = [];

  for (const geo of GEO_ORDER) {
    const jobs = groups.get(geo);
    if (!jobs || jobs.length === 0) continue;
    const entries = jobs.map((r) => formatEntry(r, webAppUrl));
    textSections.push(
      `=== ${geo} ===\n\n${entries.map((e) => e.text).join("\n\n")}`,
    );
    htmlSections.push(
      `<h2 style="font-size:14px;font-weight:600;color:#374151;margin:24px 0 8px;padding-bottom:4px;border-bottom:1px solid #e5e7eb">${geo} (${jobs.length})</h2>` +
        entries.map((e) => e.html).join(""),
    );
  }

  const durationFooter =
    durationMs !== undefined
      ? `\n\nCompleted in ${(durationMs / 1000).toFixed(1)}s`
      : "";
  const durationHtml =
    durationMs !== undefined
      ? `<div style="font-size:12px;color:#9ca3af;margin-top:16px">Completed in ${(durationMs / 1000).toFixed(1)}s</div>`
      : "";

  const passEntries = Object.values(passJobs ?? {});
  const passHtml =
    passEntries.length > 0
      ? `<details style="margin-top:20px"><summary style="font-size:13px;color:#6b7280;cursor:pointer">🔴 Pass (${passEntries.length})</summary><ul style="margin:8px 0 0;padding-left:16px;font-size:12px;color:#6b7280">` +
        passEntries
          .map((r) => {
            const root = webAppUrl.replace(/\/$/, "");
            const scoreUrl = `${root}/api/score?id=${encodeURIComponent(r.id)}`;
            return `<li style="margin-bottom:4px">${r.company} — ${r.title} <a href="${scoreUrl}" style="color:#9ca3af">Why?</a></li>`;
          })
          .join("") +
        "</ul></details>"
      : "";

  const logsHtml =
    logs && logs.length > 0
      ? `<details style="margin-top:20px"><summary style="font-size:12px;color:#9ca3af;cursor:pointer">Run log (${logs.length} lines)</summary><pre style="font-size:11px;color:#6b7280;white-space:pre-wrap;margin-top:8px">${logs.join("\n")}</pre></details>`
      : "";

  await resend.emails.send({
    from: "alerts@bluxomelabs.com",
    to: email,
    subject: `Jobs for ${new Date().toLocaleString("en-US", { month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Los_Angeles" })}`,
    text: textSections.join("\n\n") + durationFooter,
    html: htmlSections.join("") + durationHtml + passHtml + logsHtml,
  });
}

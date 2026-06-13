import type { VercelRequest, VercelResponse } from "@vercel/node";
import { loadScore } from "../src/seen";

const VERDICT_LABEL: Record<string, string> = {
  "🟢": "Strong Fit — Pursue Actively",
  "🟡": "Conditional Fit — Dig Deeper Before Committing",
  "🔴": "Pass — Meaningful Misalignment",
};

const VERDICT_COLOR: Record<string, string> = {
  "🟢": "#22c55e",
  "🟡": "#eab308",
  "🔴": "#ef4444",
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  res.setHeader("Content-Type", "text/html");

  const id = req.query["id"] as string | undefined;
  if (!id) {
    res.status(400).send("<p>Missing id parameter.</p>");
    return;
  }

  const record = await loadScore(id);
  if (!record) {
    res.status(404).send("<p>Score not found.</p>");
    return;
  }

  const { job, verdict, reasoning, scoredAt } = record;
  const color = VERDICT_COLOR[verdict] ?? "#9ca3af";
  const label = VERDICT_LABEL[verdict] ?? "Unknown";
  const date = new Date(scoredAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(job.company)} — ${escapeHtml(job.title)}</title>
</head>
<body style="font-family:sans-serif;max-width:680px;margin:32px auto;padding:0 16px;color:#111">
  <div style="border-left:5px solid ${color};padding:12px 16px;margin-bottom:24px;background:#f9f9f9">
    <div style="font-size:22px;font-weight:bold;margin-bottom:4px">
      ${verdict} ${escapeHtml(job.company)}
    </div>
    <div style="font-size:16px;margin-bottom:4px">${escapeHtml(job.title)}</div>
    ${job.location ? `<div style="color:#6b7280;font-size:13px">${escapeHtml(job.location)}</div>` : ""}
    <div style="margin-top:8px">
      <span style="background:${color};color:#fff;padding:3px 10px;border-radius:12px;font-size:13px;font-weight:600">
        ${verdict} ${escapeHtml(label)}
      </span>
    </div>
    <div style="margin-top:8px;font-size:12px;color:#9ca3af">
      Scored ${date} · <a href="${escapeHtml(job.url)}">View job posting</a>
    </div>
  </div>

  <h3 style="margin-bottom:8px">Scoring breakdown</h3>
  <div style="font-size:14px;line-height:1.6;font-family:monospace;white-space:pre-wrap;background:#f4f4f5;padding:16px;border-radius:6px">
${escapeHtml(reasoning)}
  </div>
</body>
</html>`);
}

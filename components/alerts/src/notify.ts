import { Resend } from 'resend';
import { requireEnv, ENV } from './config/settings';
import { JobResult, SearchResults } from './linkedin';

const JUDGMENT_COLOR: Record<string, string> = {
  '🟢': '#22c55e',
  '🟡': '#eab308',
  '🔴': '#ef4444',
};

export function sourceLine(search: string, source: string): string {
  const isTopApplicant = source.toLowerCase().includes('top applicant');
  return isTopApplicant ? source : `${search} · ${source}`;
}

export function formatEntry(r: JobResult, webAppUrl: string): { text: string; html: string } {
  const base     = webAppUrl.replace(/\/$/, '') + '/api/block';
  const banCo    = `${base}?type=company&value=${encodeURIComponent(r.company)}`;
  const banTi    = `${base}?type=title&value=${encodeURIComponent(r.title)}`;
  const judgment = r.judgment ?? '?';
  const color    = JUDGMENT_COLOR[judgment] ?? '#9ca3af';
  const meta     = sourceLine(r.search, r.source ?? 'LinkedIn');
  return {
    text: [`[${judgment}] ${r.company} — ${r.title}`, r.location, r.info, r.url, meta, '---'].filter(Boolean).join('\n'),
    html: `<div style="margin-bottom:14px;padding:10px 12px;border-left:4px solid ${color}">
      <div style="font-size:18px;font-weight:bold;margin-bottom:4px">${judgment} <a href="${r.url}" style="color:inherit;text-decoration:none">${r.company}</a> <a href="${banCo}" style="font-size:12px;text-decoration:none">👎</a></div>
      <div style="margin-bottom:4px">${r.title} <a href="${banTi}" style="font-size:12px;text-decoration:none">👎</a></div>
      ${r.location ? `<div style="color:#6b7280;font-size:13px">${r.location}</div>` : ''}
      ${r.info ? `<div style="font-size:13px">${r.info}</div>` : ''}
      <div style="font-size:13px;margin-top:4px"><a href="${r.url}">${r.url}</a></div>
      <div style="font-size:12px;color:#6b7280;margin-top:2px">${meta}</div>
    </div>`,
  };
}

export async function notify(results: SearchResults, webAppUrl: string): Promise<void> {
  const email  = requireEnv(ENV.MY_EMAIL);
  const resend = new Resend(requireEnv(ENV.RESEND_API_KEY));
  const entries = Object.values(results).map(r => formatEntry(r, webAppUrl));

  await resend.emails.send({
    from:    'alerts@bluxomelabs.com',
    to:      email,
    subject: `Jobs for ${new Date().toLocaleDateString()}`,
    text:    entries.map(e => e.text).join('\n\n'),
    html:    entries.map(e => e.html).join(''),
  });
}

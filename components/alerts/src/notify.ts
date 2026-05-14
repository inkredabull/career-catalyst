import { Resend } from 'resend';
import { requireEnv, ENV } from './config/settings';
import { JobResult, SearchResults } from './linkedin';

function formatEntry(r: JobResult, webAppUrl: string): { text: string; html: string } {
  const banCo = `${webAppUrl}?type=company&value=${encodeURIComponent(r.company)}`;
  const banTi = `${webAppUrl}?type=title&value=${encodeURIComponent(r.title)}`;
  const judgment = r.judgment ? `${r.judgment} ` : '';
  return {
    text: [r.judgment, r.company, r.title, r.location, r.info, r.url, r.search, '***'].filter(Boolean).join('\n'),
    html: `<div style="margin-bottom:12px;padding:8px;border-left:3px solid #ccc">
      <strong>${judgment}${r.company}</strong> <a href="${banCo}">👎</a><br>
      ${r.title} <a href="${banTi}">👎</a><br>
      ${r.location ? `<small>${r.location}</small><br>` : ''}
      ${r.info ? r.info + '<br>' : ''}
      <a href="${r.url}">${r.url}</a><br>
      <small>${r.search}</small><br>
      <small>Source: ${r.source ?? 'LinkedIn'}</small>
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

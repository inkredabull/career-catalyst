#!/usr/bin/env node
/**
 * One-off backfill: parse a saved "LinkedIn → My Network → Invitation Manager →
 * Sent" page export (View Source / "Save Page As" HTML) and append one row per
 * contact into the "Positioning : fCTO Leads" Google Sheet tab.
 *
 * Usage:
 *   npx tsx scripts/backfill-fcto-leads.ts <path-to-saved.html> [--dry-run]
 *
 * Safe to re-run: contacts whose "LI URL" already exists in the sheet are
 * skipped (dedup via fetchExistingLeadUrls()).
 */

import { readFileSync } from 'fs';
import * as cheerio from 'cheerio';
import { appendFctoLeadRows, fetchExistingLeadUrls, type FctoLeadRow } from '@inkredabull/career-catalyst-linkedin-automation';

interface ParsedContact {
  name: string;
  title: string;
  linkedInUrl?: string;
  sentText: string;
}

function parseSentDate(sentText: string, now: Date): string {
  const text = sentText.trim();
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  if (/^Sent yesterday$/i.test(text)) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return iso(d);
  }
  let m = text.match(/^Sent\s+(\d+)\s+hours?\s+ago$/i);
  if (m) {
    const d = new Date(now.getTime() - Number(m[1]) * 60 * 60 * 1000);
    return iso(d);
  }
  m = text.match(/^Sent\s+(\d+)\s+days?\s+ago$/i);
  if (m) {
    const d = new Date(now);
    d.setDate(d.getDate() - Number(m[1]));
    return iso(d);
  }
  m = text.match(/^Sent\s+(\d+)\s+weeks?\s+ago$/i);
  if (m) {
    const d = new Date(now);
    d.setDate(d.getDate() - Number(m[1]) * 7);
    return iso(d);
  }
  m = text.match(/^Sent\s+(\d+)\s+months?\s+ago$/i);
  if (m) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - Number(m[1]));
    return iso(d);
  }
  console.warn(`  Could not parse date "${text}" — defaulting to today`);
  return iso(now);
}

function parseInvitationsHtml(html: string): ParsedContact[] {
  const $ = cheerio.load(html);
  const contacts: ParsedContact[] = [];

  $('div[role="listitem"]').each((_, el) => {
    const listitem = $(el);
    const paragraphs = listitem
      .find('p')
      .map((__, p) => $(p).text().trim())
      .get()
      .filter(Boolean);

    if (paragraphs.length === 0) return;

    const name = paragraphs[0];
    const sentIdx = paragraphs.findIndex(t => /^Sent\b/i.test(t));
    if (sentIdx === -1) return; // not a contact row (e.g. section headers)

    const title = sentIdx > 1 ? paragraphs[1] : '';
    const sentText = paragraphs[sentIdx];

    const profileLink = listitem.find('a[href*="linkedin.com/in/"]').first().attr('href');
    const linkedInUrl = profileLink ? profileLink.split('?')[0] : undefined;

    contacts.push({ name, title, linkedInUrl, sentText });
  });

  return contacts;
}

async function main(): Promise<void> {
  const [htmlPath, ...rest] = process.argv.slice(2);
  const dryRun = rest.includes('--dry-run');

  if (!htmlPath) {
    console.error('Usage: npx tsx scripts/backfill-fcto-leads.ts <path-to-saved.html> [--dry-run]');
    process.exit(1);
  }

  const html = readFileSync(htmlPath, 'utf-8');
  const contacts = parseInvitationsHtml(html);
  console.log(`Parsed ${contacts.length} contact(s) from ${htmlPath}`);

  const existingUrls = dryRun ? new Set<string>() : await fetchExistingLeadUrls();
  const now = new Date();

  const rowsToAppend: FctoLeadRow[] = [];
  let skipped = 0;

  for (const contact of contacts) {
    if (contact.linkedInUrl && existingUrls.has(contact.linkedInUrl)) {
      skipped++;
      continue;
    }

    const updatedAt = parseSentDate(contact.sentText, now);

    if (dryRun) {
      console.log(`  [dry-run] ${contact.name} | ${contact.title} | ${contact.linkedInUrl ?? '(no url)'} | ${updatedAt}`);
    }

    rowsToAppend.push({
      name: contact.name,
      liSummary: contact.title,
      liUrl: contact.linkedInUrl,
      status: 'Connection Request',
      updatedAt,
    });
  }

  if (!dryRun && rowsToAppend.length > 0) {
    // Batch in chunks to stay well under the Sheets API append/write quota.
    const CHUNK_SIZE = 200;
    for (let i = 0; i < rowsToAppend.length; i += CHUNK_SIZE) {
      await appendFctoLeadRows(rowsToAppend.slice(i, i + CHUNK_SIZE));
    }
  }

  console.log(`\n✅ Done: ${rowsToAppend.length} row(s) ${dryRun ? 'would be appended' : 'appended'}, ${skipped} skipped as already present.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

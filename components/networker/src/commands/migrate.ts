/**
 * migrate command — one-time import of withdrawn_log.csv into the tracker JSON.
 *
 * Column mapping:
 *   name            → name
 *   profile_url     → linkedInUrl
 *   original_message→ originalMessage
 *   date_withdrawn  → withdrawnDate  (also → nextEligibleDate = +21 days)
 *   draft_message   → variant1
 *   title + company + category → notes
 *   pending_send    → WITHDRAWN
 *   sent            → COMPLETE
 *
 * Usage: networker migrate <csv-file>
 */

import { readFileSync } from 'fs';
import { Command } from 'commander';
import { appendContact, getAllContacts } from '../services/tracker.js';
import { TrackedContact, STATUS } from '../types.js';
import { DAYS } from '../config.js';

// ---------------------------------------------------------------------------
// Minimal quoted-CSV parser (handles fields wrapped in double quotes)
// ---------------------------------------------------------------------------

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote inside quoted field
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function parseCSV(content: string): Array<Record<string, string>> {
  const lines = content.split('\n').map(l => l.trimEnd()).filter(l => l.length > 0);
  const rows: Array<Record<string, string>> = [];
  let headers: string[] = [];

  for (const line of lines) {
    const fields = parseCSVLine(line);
    if (headers.length === 0) {
      headers = fields.map(h => h.trim());
      continue;
    }
    // Skip duplicate header rows (can appear in the CSV from the Cowork project)
    if (fields[0]?.trim() === headers[0]) continue;

    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (fields[i] ?? '').trim(); });
    rows.push(row);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export function registerMigrate(program: Command): void {
  program
    .command('migrate <csv-file>')
    .description('One-time import of withdrawn_log.csv into the tracker')
    .option('--dry-run', 'Preview rows without writing to tracker', false)
    .action((csvFile: string, opts: { dryRun?: boolean }) => {
      const dryRun = Boolean(opts.dryRun);

      let content: string;
      try {
        content = readFileSync(csvFile, 'utf-8');
      } catch {
        console.error(`Cannot read file: ${csvFile}`);
        process.exit(1);
      }

      const rows = parseCSV(content);
      if (rows.length === 0) {
        console.log('No data rows found in CSV.');
        return;
      }

      // Deduplicate against existing tracker entries
      const existing = getAllContacts();
      const existingUrls = new Set(existing.map(c => c.linkedInUrl.toLowerCase()));

      let imported = 0;
      let skipped = 0;

      console.log(`Found ${rows.length} rows in CSV\n`);

      for (const row of rows) {
        const name = row['name'] ?? '';
        const profileUrl = row['profile_url'] ?? '';
        const originalMessage = row['original_message'] ?? '';
        const dateWithdrawn = row['date_withdrawn'] ?? null;
        const draftMessage = row['draft_message'] ?? '';
        const csvStatus = (row['status'] ?? '').toLowerCase();
        const title = row['title'] ?? '';
        const company = row['company'] ?? '';
        const category = row['category'] ?? '';

        if (!name) { skipped++; continue; }

        // Skip duplicates by LinkedIn URL
        if (profileUrl && existingUrls.has(profileUrl.toLowerCase())) {
          console.log(`  SKIP (exists): ${name}`);
          skipped++;
          continue;
        }

        // Map CSV status → TrackedContact status
        const status =
          csvStatus === 'sent' ? STATUS.COMPLETE :
          csvStatus === 'pending_send' ? STATUS.WITHDRAWN :
          STATUS.WITHDRAWN; // default for unrecognised values

        // Calculate next eligible date from withdrawal date
        const nextEligibleDate =
          dateWithdrawn ? addDays(dateWithdrawn, DAYS.LINKEDIN_COOLDOWN) : null;

        // Compose notes from title/company/category
        const notesParts = [title, company, category].filter(Boolean);
        const notes = notesParts.join(' · ');

        const contact: Omit<TrackedContact, 'id'> = {
          name,
          linkedInUrl: profileUrl,
          originalMessage,
          dateSent: null,           // not captured in withdrawn_log.csv
          status,
          withdrawnDate: dateWithdrawn || null,
          attemptsUsed: 0,
          lastAttemptDate: null,
          nextEligibleDate,
          variant1: draftMessage,
          variant2: '',
          notes,
        };

        if (dryRun) {
          console.log(`  WOULD IMPORT [${status}]: ${name} — ${profileUrl}`);
        } else {
          appendContact(contact);
          existingUrls.add(profileUrl.toLowerCase());
          console.log(`  ✅ Imported [${status}]: ${name}`);
        }
        imported++;
      }

      console.log('');
      if (dryRun) {
        console.log(`Dry run: ${imported} would be imported, ${skipped} skipped.`);
      } else {
        console.log(`Done: ${imported} imported, ${skipped} skipped.`);
        console.log(`\nRun "networker review" to see who's ready for re-invite.`);
      }
    });
}

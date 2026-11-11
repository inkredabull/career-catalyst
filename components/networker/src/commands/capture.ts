/**
 * capture command: Luma/Partiful URL -> attendee names file (+ Google Sheet tab + Reminder).
 * Automates the manual steps 1-7 of the Meetup Networker workflow.
 *
 * Usage: networker capture <url> [--out-dir dir] [--no-sheet] [--no-reminder]
 */

import { Command } from 'commander';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { scrapeEvent } from '../services/attendeeScraper.js';
import { createEventTab, deleteEventTab, sheetTabName } from '../services/sheetTab.js';
import { createReminder, DEFAULT_REMINDER_LIST } from '../services/reminder.js';

export interface CaptureOptions {
  outDir?: string;
  sheet?: boolean;      // commander --no-sheet sets this to false
  keepSheet?: boolean;  // --keep-sheet: do not delete the tab after the CSV is saved
  reminder?: boolean;   // commander --no-reminder sets this to false
}

export interface CaptureResult {
  filePath: string;
  eventName: string;
  nameCount: number;
}

/** "Title: Sub" -> "Title_ Sub" (the convention eventParser reverses), and strip path-hostile characters. */
function fileSafe(title: string): string {
  return title.replace(/:\s/g, '_ ').replace(/[\/\\?*"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

export async function captureEvent(url: string, opts: CaptureOptions = {}): Promise<CaptureResult> {
  console.log(`Capturing attendees from ${url}\n`);
  const ev = await scrapeEvent(url);

  if (ev.names.length === 0) throw new Error('The attendee list was empty; nothing to write.');
  if (ev.expectedCount && ev.names.length < ev.expectedCount) {
    console.warn(`Warning: page advertises ${ev.expectedCount} attendees but only ${ev.names.length} were collected (hidden or private guests are normal).`);
  }
  if (ev.dateGuessed) console.warn("Warning: could not read the event date from the page; using today's date.");

  const yy = String(ev.year).slice(-2);
  const eventName = `${fileSafe(ev.title)} on ${ev.month}-${ev.day}-${yy}`;
  const outDir = resolve(opts.outDir ?? 'data/lists');
  mkdirSync(outDir, { recursive: true });
  const filePath = resolve(outDir, `${eventName}.csv`);

  // A leftover empty file is just a fully processed run (discover empties it), so it is safe to replace.
  const isStale = existsSync(filePath) && readFileSync(filePath, 'utf-8').trim() === '';
  if (existsSync(filePath) && !isStale) {
    throw new Error(`${filePath} already exists (a previous run may be partly processed). Delete it or pass --out-dir to use another folder.`);
  }
  writeFileSync(filePath, ev.names.join('\n') + '\n', 'utf-8');
  console.log(`Wrote ${ev.names.length} names to ${filePath}`);

  if (opts.sheet !== false) {
    const tab = sheetTabName(ev.title, ev.month, ev.day);
    try {
      const r = await createEventTab(tab, ev.names);
      console.log(r === 'created' ? `Sheet tab created: "${tab}"` : `Sheet tab "${tab}" already exists; left untouched.`);

      // The CSV is the working copy; once it is verifiably on disk, remove the tab we created.
      // Never deletes a tab that already existed before this run.
      if (r === 'created' && !opts.keepSheet) {
        const saved = readFileSync(filePath, 'utf-8').split('\n').filter(l => l.trim()).length;
        if (saved === ev.names.length) {
          const removed = await deleteEventTab(tab);
          console.log(removed ? `CSV saved (${saved} names); sheet tab deleted.` : 'Sheet tab already gone.');
        } else {
          console.warn(`CSV has ${saved} names but ${ev.names.length} were captured; keeping the sheet tab.`);
        }
      }
    } catch (err) {
      console.warn(`Could not create sheet tab (continuing): ${err instanceof Error ? err.message : err}`);
    }
  }

  if (opts.reminder !== false) {
    try {
      createReminder({
        title: `Run through Meetup Networker : Process ${ev.title} attendees (${ev.month}/${ev.day})`,
        body: `${ev.names.length} names captured from ${url}\nResume: npm run process -- "${filePath}"`,
      });
      console.log(`Reminder created in "${DEFAULT_REMINDER_LIST}"`);
    } catch (err) {
      console.warn(`Could not create reminder (continuing): ${err instanceof Error ? err.message : err}`);
    }
  }

  return { filePath, eventName, nameCount: ev.names.length };
}

export function registerCapture(program: Command): void {
  program
    .command('capture <url>')
    .description('Scrape a Luma/Partiful attendee list into a names file, a Google Sheet tab, and a Reminder')
    .option('--out-dir <dir>', 'Where to write the names file', 'data/lists')
    .option('--no-sheet', 'Skip creating the Google Sheet tab')
    .option('--no-reminder', 'Skip creating the Reminder')
    .option('--keep-sheet', 'Keep the Google Sheet tab instead of deleting it after the CSV is saved')
    .action(async (url: string, opts: CaptureOptions) => {
      try {
        const r = await captureEvent(url, opts);
        console.log(`\nNext: npm run process -- "${r.filePath}"`);
      } catch (err) {
        console.error(`\nCapture failed: ${err instanceof Error ? err.message : err}`);
        process.exitCode = 1;
      }
    });
}

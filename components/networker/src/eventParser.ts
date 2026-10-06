/** Ported from meetup-networker/eventParser.ts — no changes. */

import { basename } from 'path';

export interface EventInfo {
  eventName: string;
  fileName: string;
  eventDate: Date | undefined;
}

export type EventPhase = 'before' | 'day-of' | 'after';

/**
 * Parse event name from filename.
 * Format: "Event Name on MM-DD-YY.txt" | "Event Name on MM/DD/YY.csv"
 * Underscores in the date portion are normalised to slashes.
 * Falls back to the filename stem if no date pattern is found.
 */
export function parseEventFromFileName(filePath: string): EventInfo {
  const fileName = basename(filePath);
  let nameWithoutExt = fileName.replace(/\.(txt|csv)$/i, '');
  // Restore colons: macOS/Chrome saves "Title: Subtitle" as "Title_ Subtitle"
  // (underscore + space never otherwise occurs — date underscores have no spaces).
  nameWithoutExt = nameWithoutExt.replace(/_ /g, ': ');

  const dateMatch = nameWithoutExt.match(/on\s+(\d+)[-_](\d+)[-_](\d+)/);
  // Normalise underscore-separated dates: "on 1_13_26" → "on 1/13/26"
  nameWithoutExt = nameWithoutExt.replace(/on\s+(\d+)_(\d+)_(\d+)/, 'on $1/$2/$3');

  let eventDate: Date | undefined;
  if (dateMatch) {
    const [, mm, dd, yy] = dateMatch;
    const month = parseInt(mm, 10);
    const day = parseInt(dd, 10);
    // Two-digit year in filenames always means 2000s (e.g. "26" -> 2026).
    const year = yy.length === 2 ? 2000 + parseInt(yy, 10) : parseInt(yy, 10);
    const candidate = new Date(year, month - 1, day);
    // Reject impossible dates instead of accepting JS Date's silent rollover (e.g. month 13).
    if (candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day) {
      eventDate = candidate;
    }
  }

  return { eventName: nameWithoutExt, fileName, eventDate };
}

/**
 * Classify `eventDate` relative to `today` by calendar day (time-of-day ignored).
 * No parseable date is treated as 'after' — preserves the single-template behavior
 * that existed before phase-based template selection, for any filename that doesn't
 * match the date pattern.
 */
export function getEventPhase(eventDate: Date | undefined, today: Date = new Date()): EventPhase {
  if (!eventDate) return 'after';
  const toDayNumber = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const eventDay = toDayNumber(eventDate);
  const todayDay = toDayNumber(today);
  if (todayDay < eventDay) return 'before';
  if (todayDay === eventDay) return 'day-of';
  return 'after';
}

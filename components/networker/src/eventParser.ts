/** Ported from meetup-networker/eventParser.ts — no changes. */

import { basename } from 'path';

export interface EventInfo {
  eventName: string;
  fileName: string;
}

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
  // Normalise underscore-separated dates: "on 1_13_26" → "on 1/13/26"
  nameWithoutExt = nameWithoutExt.replace(/on\s+(\d+)_(\d+)_(\d+)/, 'on $1/$2/$3');
  return { eventName: nameWithoutExt, fileName };
}

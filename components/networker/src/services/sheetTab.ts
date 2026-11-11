/**
 * sheetTab: creates a "<title> on <m/d>" tab in the Meetup Networker Google Sheet
 * and writes the attendee names into it (one per row). Never overwrites an existing tab.
 */

import { GoogleSheetsClient, extractSpreadsheetId } from '@inkredabull/career-catalyst-core';

const DEFAULT_SPREADSHEET = '1cEH5e0-d9IYmx0GCX88Y_vGlXt6dYk02QeiF9Be2H98';

export function sheetTabName(title: string, month: number, day: number): string {
  return `${title.trim()} on ${month}/${day}`.slice(0, 100);
}

export async function createEventTab(tabName: string, names: string[]): Promise<'created' | 'exists'> {
  const raw = process.env.MEETUP_NETWORKER_SPREADSHEET_ID ?? DEFAULT_SPREADSHEET;
  const spreadsheetId = raw.startsWith('http') ? extractSpreadsheetId(raw) : raw;

  const sheets = (new GoogleSheetsClient() as any).sheets;
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  const titles: string[] = (meta.data.sheets ?? []).map((s: any) => s.properties.title);
  if (titles.includes(tabName)) return 'exists';

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabName.replace(/'/g, "''")}'!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: names.map(n => [n]) },
  });
  return 'created';
}

/** Deletes a tab by name. Only call for a tab this run created. */
export async function deleteEventTab(tabName: string): Promise<boolean> {
  const raw = process.env.MEETUP_NETWORKER_SPREADSHEET_ID ?? DEFAULT_SPREADSHEET;
  const spreadsheetId = raw.startsWith('http') ? extractSpreadsheetId(raw) : raw;

  const sheets = (new GoogleSheetsClient() as any).sheets;
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties(sheetId,title)' });
  const match = (meta.data.sheets ?? []).find((x: any) => x.properties.title === tabName);
  if (!match) return false;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ deleteSheet: { sheetId: match.properties.sheetId } }] },
  });
  return true;
}

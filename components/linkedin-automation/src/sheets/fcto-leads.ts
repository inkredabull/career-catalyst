import { GoogleSheetsClient, extractSpreadsheetId } from '@inkredabull/career-catalyst-core';

export type FctoLeadStatus = 'Connection Request' | 'Accepted/Replied' | 'Discovery Call Sched' | 'Closed';

export interface FctoLeadRow {
  name: string;
  liSummary?: string;
  liUrl?: string;
  status: FctoLeadStatus;
  updatedAt: string;
  icp?: string;
}

function resolveTarget(): { spreadsheetId: string; sheetName: string } | null {
  const spreadsheetUrl = process.env.FCTO_LEADS_SPREADSHEET_ID;
  const sheetName = process.env.FCTO_LEADS_SHEET_NAME ?? 'Positioning : fCTO Leads';

  if (!spreadsheetUrl) {
    console.warn('[fcto-leads-sheet] FCTO_LEADS_SPREADSHEET_ID not set — skipping sheet append');
    return null;
  }

  const spreadsheetId = spreadsheetUrl.startsWith('http')
    ? extractSpreadsheetId(spreadsheetUrl)
    : spreadsheetUrl;

  return { spreadsheetId, sheetName };
}

/** Reads existing "LI URL" values in the sheet, for dedup on reruns. */
export async function fetchExistingLeadUrls(): Promise<Set<string>> {
  const target = resolveTarget();
  if (!target) return new Set();
  const { spreadsheetId, sheetName } = target;

  const client = new GoogleSheetsClient();
  const headers: string[] = await (client as any).readHeaders(spreadsheetId, sheetName);
  const urlCol = headers.findIndex(h => h.toLowerCase() === 'li url');
  if (urlCol === -1) return new Set();

  const response = await (client as any).sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A2:Z`,
  });
  const rows: string[][] = response.data.values ?? [];
  return new Set(rows.map(r => r[urlCol]).filter(Boolean));
}

function toRow(data: FctoLeadRow, headers: string[]): string[] {
  const row: Record<string, string> = {
    'Name':       data.name,
    'LI Summary': data.liSummary ?? '',
    'LI URL':     data.liUrl ?? '',
    'Status':     data.status,
    'Updated At': data.updatedAt,
    'ICP?':       data.icp ?? '',
  };
  return headers.map(h => row[h] ?? '');
}

export async function appendFctoLeadRow(data: FctoLeadRow): Promise<void> {
  return appendFctoLeadRows([data]);
}

/**
 * Appends multiple rows in a single Sheets API call (one readHeaders + one
 * append), to stay well under the per-minute read/write quota when
 * batch-importing many contacts at once (see backfill-fcto-leads.ts).
 */
export async function appendFctoLeadRows(data: FctoLeadRow[]): Promise<void> {
  if (data.length === 0) return;
  const target = resolveTarget();
  if (!target) return;
  const { spreadsheetId, sheetName } = target;

  const client = new GoogleSheetsClient();
  const headers: string[] = await (client as any).readHeaders(spreadsheetId, sheetName);
  const values = data.map(d => toRow(d, headers));

  await (client as any).sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:Z`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });

  console.log(`[fcto-leads-sheet] Appended ${data.length} row(s)`);
}

import { GoogleSheetsClient, extractSpreadsheetId } from '@inkredabull/career-catalyst-core';
import { parseCompanySlug } from '../message/template.js';

export interface CompanyRowData {
  companyUrl?: string;
  companyLinkedInUrl?: string;
  stage?: string;
  notes?: string;
}

function companyNameFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host.split('.')[0] ?? host;
  } catch {
    return '';
  }
}

export async function appendCompanyRow(data: CompanyRowData): Promise<void> {
  const spreadsheetUrl = process.env.COMPANY_TRACKING_SPREADSHEET_ID;
  const sheetName = process.env.COMPANY_TRACKING_SHEET_NAME ?? 'Companies';

  if (!spreadsheetUrl) {
    console.warn('[company-sheet] COMPANY_TRACKING_SPREADSHEET_ID not set — skipping sheet append');
    return;
  }

  const spreadsheetId = spreadsheetUrl.startsWith('http')
    ? extractSpreadsheetId(spreadsheetUrl)
    : spreadsheetUrl;

  const slug = data.companyLinkedInUrl ? parseCompanySlug(data.companyLinkedInUrl) : '';

  // Row values keyed by the exact header labels in the sheet
  const row: Record<string, string> = {
    'Company URL':          data.companyUrl ?? '',
    'Company Name From URL': data.companyUrl ? companyNameFromUrl(data.companyUrl) : '',
    'Company LI Slug':      slug,
    'LI URL':               data.companyLinkedInUrl ?? '',
    'Stage':                data.stage ?? '',
    'Notes':                data.notes ?? '',
  };

  const client = new GoogleSheetsClient();
  // Use the sheet's header row to drive column order (associative insertion)
  const headers = await (client as any).readHeaders(spreadsheetId, sheetName);
  const values = headers.map((h: string) => row[h] ?? '');

  await (client as any).sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:Z`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  });

  console.log(`[company-sheet] Appended row for ${slug || data.companyUrl}`);
}

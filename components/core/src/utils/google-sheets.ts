import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { JobListing } from '../types';

/**
 * Google Sheets utility for managing job tracking spreadsheet
 */

export interface JobRow {
  id: string;
  role: string;
  company: string;
  status: string;
  applied?: string; // Date string
  updated?: string; // Date string
  rejectionRationale?: string;
  notes?: string;
  origin?: string;
  score?: string; // Percentage as string, e.g., "85%"
  threshold?: string;
  analysis?: string;
  jobUrl?: string;
  resumeUrl?: string;
  critique?: string;
  whoGotHired?: string;
  jobTitleShorthand?: string;
  description?: string;
  location?: string;
  salaryMin?: string;
  salaryMax?: string;
  salaryCurrency?: string;
  linkedInCompany?: string;
  companyStage?: string;
}

// Maps each JobRow field to the canonical header label used in the Google Sheet (row 1).
// Matching is case-insensitive, so "Score (%)", "score (%)", "SCORE (%)" all resolve correctly.
// Extra sheet columns (e.g. "Advanced?") are preserved as empty strings.
const FIELD_HEADERS: Record<keyof JobRow, string> = {
  id:                 'ID',
  role:               'Role',
  company:            'Company',
  status:             'Status',
  companyStage:       'Stage',
  notes:              'Notes',
  jobUrl:             'Job URL',
  applied:            'Applied',
  updated:            'Updated',
  rejectionRationale: 'Rejection Rationale',
  origin:             'Origin',
  score:              'Score (%)',
  threshold:          'Threshold?',
  analysis:           'Analysis',
  resumeUrl:          'Resume URL',
  critique:           'Critique',
  whoGotHired:        'Who Got Hired',
  jobTitleShorthand:  'Title Short',
  description:        'Description',
  location:           'Location',
  salaryMin:          'Min Salary',
  salaryMax:          'Max Salary',
  salaryCurrency:     'Denomination',
  linkedInCompany:    'LI Slug',
};

// Reverse lookup: lowercased header label → JobRow field (built once at module load)
const HEADER_TO_FIELD: Map<string, keyof JobRow> = new Map(
  (Object.entries(FIELD_HEADERS) as Array<[keyof JobRow, string]>).map(
    ([field, header]) => [header.toLowerCase(), field]
  )
);

function buildRow(row: Partial<JobRow>, headers: string[]): string[] {
  return headers.map(h => {
    const field = HEADER_TO_FIELD.get(h.toLowerCase());
    return field ? (row[field] ?? '') : '';
  });
}

function parseRow(values: string[], headers: string[]): JobRow {
  const row: Partial<JobRow> = {};
  headers.forEach((h, i) => {
    const field = HEADER_TO_FIELD.get(h.toLowerCase());
    if (field) (row as Record<string, string>)[field] = values[i] ?? '';
  });
  return row as JobRow;
}

function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export class GoogleSheetsClient {
  private sheets: any;
  private oauth2Client: OAuth2Client;
  private headerCache = new Map<string, string[]>();

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob'
    );

    // Set refresh token if available
    if (process.env.GOOGLE_REFRESH_TOKEN) {
      this.oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
      });
    }

    this.sheets = google.sheets({ version: 'v4', auth: this.oauth2Client });
  }

  private async readHeaders(spreadsheetId: string, sheetName: string): Promise<string[]> {
    const cacheKey = `${spreadsheetId}::${sheetName}`;
    if (this.headerCache.has(cacheKey)) return this.headerCache.get(cacheKey)!;
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!1:1`,
    });
    const headers: string[] = (response.data.values?.[0] ?? []).map(String);
    this.headerCache.set(cacheKey, headers);
    return headers;
  }

  /**
   * Insert a row at the top of the sheet (below headers in row 1)
   * This inserts at row 2, pushing all existing data down
   */
  async insertRowAtTop(
    spreadsheetId: string,
    sheetName: string,
    row: JobRow
  ): Promise<void> {
    try {
      if (!process.env.GOOGLE_REFRESH_TOKEN) {
        throw new Error('GOOGLE_REFRESH_TOKEN not found. Run: npm run setup-gmail');
      }

      const headers = await this.readHeaders(spreadsheetId, sheetName);
      const values = buildRow(row, headers);

      // First, insert a new row at position 2 (below headers)
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              insertDimension: {
                range: {
                  sheetId: await this.getSheetId(spreadsheetId, sheetName),
                  dimension: 'ROWS',
                  startIndex: 1, // 0-indexed, so 1 = row 2
                  endIndex: 2    // Insert 1 row
                }
              }
            }
          ]
        }
      });

      // Then populate the new row with data, spanning all header columns
      const range = `${sheetName}!A2:${colLetter(headers.length)}2`;

      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED', // Parse values like dates and numbers
        requestBody: {
          values: [values]
        }
      });

      console.log(`✅ Row inserted at top of "${sheetName}" sheet`);

    } catch (error) {
      console.error('❌ Error inserting row:', error);
      if (error instanceof Error && error.message?.includes('invalid_grant')) {
        console.error('🔑 OAuth token expired. Please re-run: npm run setup-gmail');
      }
      throw error;
    }
  }

  /**
   * Append a row to the bottom of the sheet
   */
  async appendRow(
    spreadsheetId: string,
    sheetName: string,
    row: JobRow
  ): Promise<void> {
    try {
      if (!process.env.GOOGLE_REFRESH_TOKEN) {
        throw new Error('GOOGLE_REFRESH_TOKEN not found. Run: npm run setup-gmail');
      }

      const headers = await this.readHeaders(spreadsheetId, sheetName);
      const values = buildRow(row, headers);

      const range = `${sheetName}!A:${colLetter(headers.length)}`;

      await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [values]
        }
      });

      console.log(`✅ Row appended to "${sheetName}" sheet`);

    } catch (error) {
      console.error('❌ Error appending row:', error);
      if (error instanceof Error && error.message?.includes('invalid_grant')) {
        console.error('🔑 OAuth token expired. Please re-run: npm run setup-gmail');
      }
      throw error;
    }
  }

  /**
   * Get the sheet ID (gid) from the sheet name
   */
  private async getSheetId(spreadsheetId: string, sheetName: string): Promise<number> {
    const response = await this.sheets.spreadsheets.get({
      spreadsheetId
    });

    const sheet = response.data.sheets?.find(
      (s: any) => s.properties.title === sheetName
    );

    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" not found in spreadsheet`);
    }

    return sheet.properties.sheetId;
  }

  /**
   * Read all rows from the sheet
   */
  async readAll(
    spreadsheetId: string,
    sheetName: string
  ): Promise<JobRow[]> {
    try {
      const headers = await this.readHeaders(spreadsheetId, sheetName);
      const range = `${sheetName}!A2:${colLetter(headers.length)}`; // Skip header row

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range
      });

      const rows = response.data.values || [];

      return rows.map((row: string[]) => parseRow(row, headers));

    } catch (error) {
      console.error('❌ Error reading rows:', error);
      throw error;
    }
  }

  /**
   * Update a specific row by ID
   */
  async updateRowById(
    spreadsheetId: string,
    sheetName: string,
    id: string,
    updates: Partial<JobRow>
  ): Promise<void> {
    try {
      // Read all rows to find the one with matching ID
      const rows = await this.readAll(spreadsheetId, sheetName);
      const rowIndex = rows.findIndex(r => r.id === id);

      if (rowIndex === -1) {
        throw new Error(`Row with ID "${id}" not found`);
      }

      // Merge updates with existing row
      const updatedRow = { ...rows[rowIndex], ...updates };

      const headers = await this.readHeaders(spreadsheetId, sheetName);
      const values = buildRow(updatedRow, headers);

      // Row 2 is index 0 in our data, so actual row is rowIndex + 2
      const actualRow = rowIndex + 2;
      const range = `${sheetName}!A${actualRow}:${colLetter(headers.length)}${actualRow}`;

      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [values]
        }
      });

      console.log(`✅ Updated row with ID "${id}"`);

    } catch (error) {
      console.error('❌ Error updating row:', error);
      throw error;
    }
  }
  /**
   * Fetch a single job row by ID
   */
  async fetchJobById(
    spreadsheetId: string,
    sheetName: string,
    id: string
  ): Promise<JobRow | null> {
    try {
      const rows = await this.readAll(spreadsheetId, sheetName);
      return rows.find(r => r.id === id) || null;
    } catch (error) {
      console.warn(`⚠️  Failed to fetch job from Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }
}

/**
 * Helper function to extract spreadsheet ID from URL
 */
export function extractSpreadsheetId(url: string): string {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    throw new Error('Invalid Google Sheets URL');
  }
  return match[1];
}

/**
 * Format today's date as YYYY-MM-DD
 */
export function formatDate(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

/**
 * Convert a JobRow to a JobListing for use with agents
 */
export function sheetsRowToJobListing(row: JobRow): JobListing {
  return {
    title: row.role,
    company: row.company,
    location: row.location || '',
    description: row.description || '',
    url: row.jobUrl,
    jobId: row.id,
    titleShorthand: row.jobTitleShorthand,
    salary: {
      min: row.salaryMin || '',
      max: row.salaryMax || '',
      currency: row.salaryCurrency || 'USD'
    },
    linkedInCompany: row.linkedInCompany,
    companyStage: row.companyStage
  };
}

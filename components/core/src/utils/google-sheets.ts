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
  control?: string;
  description?: string;
  location?: string;
  salaryMin?: string;
  salaryMax?: string;
  salaryCurrency?: string;
  linkedInCompany?: string;
  source?: string;
  companyStage?: string;
}

export class GoogleSheetsClient {
  private sheets: any;
  private oauth2Client: OAuth2Client;

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

      // Column order matching the headers:
      // ID, Role, Company, Status, Applied, Updated, Rejection Rationale, Notes, Origin,
      // Score (%), Threshold?, Analysis, Job URL, Resume URL, Critique, Who Got Hired,
      // JobTitleShorthand, Control?, Description, Location, SalaryMin, SalaryMax,
      // SalaryCurrency, LinkedInCompany, Source, CompanyStage
      const values = [
        row.id || '',
        row.role || '',
        row.company || '',
        row.status || '',
        row.applied || '',
        row.updated || '',
        row.rejectionRationale || '',
        row.notes || '',
        row.origin || '',
        row.score || '',
        row.threshold || '',
        row.analysis || '',
        row.jobUrl || '',
        row.resumeUrl || '',
        row.critique || '',
        row.whoGotHired || '',
        row.jobTitleShorthand || '',
        row.control || '',
        row.description || '',
        row.location || '',
        row.salaryMin || '',
        row.salaryMax || '',
        row.salaryCurrency || '',
        row.linkedInCompany || '',
        row.source || '',
        row.companyStage || ''
      ];

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

      // Then populate the new row with data
      const range = `${sheetName}!A2:Z2`; // A2 through Z2 (26 columns)

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

      const values = [
        row.id || '',
        row.role || '',
        row.company || '',
        row.status || '',
        row.applied || '',
        row.updated || '',
        row.rejectionRationale || '',
        row.notes || '',
        row.origin || '',
        row.score || '',
        row.threshold || '',
        row.analysis || '',
        row.jobUrl || '',
        row.resumeUrl || '',
        row.critique || '',
        row.whoGotHired || '',
        row.jobTitleShorthand || '',
        row.control || '',
        row.description || '',
        row.location || '',
        row.salaryMin || '',
        row.salaryMax || '',
        row.salaryCurrency || '',
        row.linkedInCompany || '',
        row.source || '',
        row.companyStage || ''
      ];

      const range = `${sheetName}!A:Z`;

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
      const range = `${sheetName}!A2:Z`; // Skip header row

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range
      });

      const rows = response.data.values || [];

      return rows.map((row: any[]) => ({
        id: row[0] || '',
        role: row[1] || '',
        company: row[2] || '',
        status: row[3] || '',
        applied: row[4] || '',
        updated: row[5] || '',
        rejectionRationale: row[6] || '',
        notes: row[7] || '',
        origin: row[8] || '',
        score: row[9] || '',
        threshold: row[10] || '',
        analysis: row[11] || '',
        jobUrl: row[12] || '',
        resumeUrl: row[13] || '',
        critique: row[14] || '',
        whoGotHired: row[15] || '',
        jobTitleShorthand: row[16] || '',
        control: row[17] || '',
        description: row[18] || '',
        location: row[19] || '',
        salaryMin: row[20] || '',
        salaryMax: row[21] || '',
        salaryCurrency: row[22] || '',
        linkedInCompany: row[23] || '',
        source: row[24] || '',
        companyStage: row[25] || ''
      }));

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

      const values = [
        updatedRow.id || '',
        updatedRow.role || '',
        updatedRow.company || '',
        updatedRow.status || '',
        updatedRow.applied || '',
        updatedRow.updated || '',
        updatedRow.rejectionRationale || '',
        updatedRow.notes || '',
        updatedRow.origin || '',
        updatedRow.score || '',
        updatedRow.threshold || '',
        updatedRow.analysis || '',
        updatedRow.jobUrl || '',
        updatedRow.resumeUrl || '',
        updatedRow.critique || '',
        updatedRow.whoGotHired || '',
        updatedRow.jobTitleShorthand || '',
        updatedRow.control || '',
        updatedRow.description || '',
        updatedRow.location || '',
        updatedRow.salaryMin || '',
        updatedRow.salaryMax || '',
        updatedRow.salaryCurrency || '',
        updatedRow.linkedInCompany || '',
        updatedRow.source || '',
        updatedRow.companyStage || ''
      ];

      // Row 2 is index 0 in our data, so actual row is rowIndex + 2
      const actualRow = rowIndex + 2;
      const range = `${sheetName}!A${actualRow}:Z${actualRow}`;

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
    source: row.source || 'extracted',
    companyStage: row.companyStage
  };
}

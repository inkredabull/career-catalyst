import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

dotenv.config({ path: path.resolve(__dirname, '../../../..', '.env') });

const WORK_HISTORY_SHEET_ID = '13j0Gfao85oJd27oXpyAMyTL2iSkJCxaB3q_U5wyb4Oc';
const COMPANIES_TAB = 'Work History : Companies & Sequence';
const STORY_BANK_TAB = 'Work History : Story Bank';

interface CompanyRow {
  company: string;
  title: string;
  duration: string;
  summaryCV: string;
  seq: number;
}

interface BulletRow {
  company: string;
  domain: string;
  cv: string;
  timing: string;
}

function makeAuth(): OAuth2Client {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  );
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  }
  return client;
}

async function readTab(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  tabName: string
): Promise<{ headers: string[]; rows: string[][] }> {
  const resp = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: [`'${tabName}'!A1:ZZ`],
  });
  const all: string[][] = (resp.data.valueRanges?.[0]?.values ?? []).map(r => r.map(String));
  if (all.length === 0) return { headers: [], rows: [] };
  return { headers: all[0], rows: all.slice(1) };
}

// Returns the index of the LAST occurrence of a header name (case-insensitive).
// Returns -1 if not found.
function lastCol(headers: string[], name: string): number {
  const lower = name.toLowerCase();
  let idx = -1;
  headers.forEach((h, i) => { if (h.toLowerCase() === lower) idx = i; });
  return idx;
}

function col(headers: string[], name: string): number {
  return headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
}

function get(row: string[], idx: number): string {
  return idx >= 0 ? (row[idx] ?? '').trim() : '';
}

function parseCompanies(headers: string[], rows: string[][]): CompanyRow[] {
  // Company column has a long descriptive header — fall back to index 0
  const iCompany  = headers.findIndex(h => h.toLowerCase() === 'company') !== -1
    ? headers.findIndex(h => h.toLowerCase() === 'company')
    : 0;
  const iTitle    = col(headers, 'Title');
  const iDuration = col(headers, 'Duration');
  const iSummary  = col(headers, 'Summary (CV)');
  // Seq column is labelled 'S' in the sheet
  const iSeq      = col(headers, 'S') !== -1 ? col(headers, 'S') : col(headers, 'Seq');

  return rows
    .map(r => ({
      company:   get(r, iCompany),
      title:     get(r, iTitle),
      duration:  get(r, iDuration),
      summaryCV: get(r, iSummary),
      seq:       parseInt(get(r, iSeq), 10) || 9999,
    }))
    .filter(c => c.company && c.title)
    .sort((a, b) => a.seq - b.seq);
}

function parseBullets(headers: string[], rows: string[][]): BulletRow[] {
  const iCompany = col(headers, 'Company');
  const iDomain  = col(headers, 'Domain');
  const iCV      = lastCol(headers, 'CV');      // last CV column has the refined text
  const iTiming  = lastCol(headers, 'Timing');  // last Timing column has formatted "Q2 '26"
  const iInclude = col(headers, 'Include?');

  return rows
    .filter(r => {
      const include = get(r, iInclude).toLowerCase();
      const cvText  = get(r, iCV);
      const domain  = get(r, iDomain);
      if (include === 'false') return false;
      if (!cvText || cvText === '#ref!' || cvText.startsWith('=')) return false;
      if (!domain || domain.toLowerCase() === '#ref!' || domain.startsWith('=')) return false;
      // Ensure there's actual bullet text beyond just a timing tag "(Qx 'xx)"
      const withoutTiming = cvText.replace(/\s*\(Q\d+ '\d+\)\s*$/, '').trim();
      return withoutTiming.length > 0;
    })
    .map(r => ({
      company: get(r, iCompany),
      domain:  get(r, iDomain),
      // Last CV column already embeds timing — use it verbatim
      cv:      get(r, iCV),
      timing:  '',
    }))
    .filter(b => b.company && b.cv);
}

function renderExperience(companies: CompanyRow[], bullets: BulletRow[]): string {
  // Group bullets: company → domain → bullets[]
  const byCompany = new Map<string, Map<string, string[]>>();
  for (const b of bullets) {
    if (!byCompany.has(b.company)) byCompany.set(b.company, new Map());
    const byDomain = byCompany.get(b.company)!;
    if (!byDomain.has(b.domain)) byDomain.set(b.domain, []);
    const bulletText = b.timing ? `${b.cv} (${b.timing})` : b.cv;
    byDomain.get(b.domain)!.push(`• ${bulletText}`);
  }

  const lines: string[] = ['EXPERIENCE', ''];

  for (const c of companies) {
    lines.push(`${c.title} @ ${c.company} (${c.duration})`);
    lines.push('');
    if (c.summaryCV) {
      lines.push(c.summaryCV);
      lines.push('');
    }

    const domains = byCompany.get(c.company);
    if (domains) {
      for (const [domain, domainBullets] of domains) {
        if (domain) {
          lines.push(`❖ ${domain} ❖`);
          lines.push('');
        }
        for (const bullet of domainBullets) {
          lines.push(bullet);
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const outputIdx = args.indexOf('--output');
  const outputPath = outputIdx >= 0
    ? args[outputIdx + 1]
    : path.resolve(__dirname, '../../../../work-history/cv.txt');

  const auth = makeAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  console.log('Reading Companies & Sequence tab...');
  const { headers: cHeaders, rows: cRows } = await readTab(sheets, WORK_HISTORY_SHEET_ID, COMPANIES_TAB);
  const companies = parseCompanies(cHeaders, cRows);
  console.log(`  ${companies.length} companies found`);

  console.log('Reading Story Bank tab...');
  const { headers: sHeaders, rows: sRows } = await readTab(sheets, WORK_HISTORY_SHEET_ID, STORY_BANK_TAB);
  const bullets = parseBullets(sHeaders, sRows);
  console.log(`  ${bullets.length} bullets included`);

  const experienceBlock = renderExperience(companies, bullets);

  if (!write) {
    console.log(experienceBlock);
    return;
  }

  const existing = fs.readFileSync(outputPath, 'utf-8');
  const experienceStart = existing.indexOf('\nEXPERIENCE\n');
  if (experienceStart === -1) {
    throw new Error('Could not find EXPERIENCE section in cv.txt');
  }

  const header = existing.slice(0, experienceStart + 1); // keep up to (but not including) EXPERIENCE
  const updated = header + experienceBlock + '\n';

  fs.writeFileSync(outputPath, updated, 'utf-8');
  console.log(`\nWrote ${updated.split('\n').length} lines to ${outputPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

// GAS entry point — all functions assigned to global scope are callable from the sheet.
import { onOpen } from './ui/menu';
import { PROFILE } from './config/profile';
import { generateOutreachMessage, OutreachContext } from './services/message-generator';
import { sendEmails, queueEmails, sendViaGmail } from './services/gmail';
import { fetchContactToSheet, getLinkedInUrlToSheet, pickRandomContacts } from './services/contacts';
import { getJobMetadata, clearJobMetadataCache } from './services/job-metadata';
import { SCRIPT_PROPS, COLS, requireProp } from './config/settings';

// ── Custom sheet functions — callable from cells as =blurb(), =resumeURL(jobId) ───

function testEmail(): string {
  return requireProp(SCRIPT_PROPS.TEST_EMAIL);
}

/** Returns the resume Drive URL for a given job ID, fetched from the /llm endpoint. */
function resumeURL(jobId: string): string {
  return getJobMetadata(jobId)?.resumeURL ?? '';
}

function blurb(): readonly string[] {
  return PROFILE.blurb;
}

// ── Mail merge / send ─────────────────────────────────────────────────────────

function sendEmailsFn(subjectLine?: string): void {
  sendEmails(subjectLine);
}

function queueEmailsFn(subjectLine?: string): void {
  queueEmails(subjectLine);
}

// ── Warmup ────────────────────────────────────────────────────────────────────

function sendWarmup(): void {
  const row: Record<string, string> = { [COLS.RECIPIENT]: requireProp(SCRIPT_PROPS.MY_EMAIL) };
  sendViaGmail(row, { subject: 'Morning Warmup', text: pickRandomContacts(), html: '' }, null);
}

// ── Outreach message generation ───────────────────────────────────────────────

function generateMessageForRow(): void {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const row = sheet.getActiveRange()?.getRow() ?? 2;

  // Col C = JobID; fetch metadata to populate company/jobTitle
  const jobId = sheet.getRange(row, 3).getValue() as string;
  const meta = getJobMetadata(jobId);

  const ctx: OutreachContext = {
    contactName: sheet.getRange(row, 1).getValue() as string,  // A
    contactRole: sheet.getRange(row, 2).getValue() as string,  // B
    company: meta?.Company ?? '',
    jobTitle: meta?.jobTitleShorthand ?? '',
    notes: sheet.getRange(row, 4).getValue() as string,        // D
  };

  const apiKey = PropertiesService.getScriptProperties().getProperty(
    SCRIPT_PROPS.ANTHROPIC_API_KEY
  );
  if (!apiKey) {
    SpreadsheetApp.getUi().alert('ANTHROPIC_API_KEY not set in Script Properties.');
    return;
  }

  const message = generateOutreachMessage(ctx, apiKey, UrlFetchApp.fetch.bind(UrlFetchApp));
  sheet.getRange(row, 5).setValue(message.subject);  // E
  sheet.getRange(row, 6).setValue(message.body);     // F
}

// ── Job metadata cache management ─────────────────────────────────────────────

function refreshJobMetadataFn(): void {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const row = sheet.getActiveRange()?.getRow() ?? 2;
  const jobId = sheet.getRange(row, 3).getValue() as string;
  if (!jobId) {
    SpreadsheetApp.getUi().alert('No JobID found in column C for this row.');
    return;
  }
  clearJobMetadataCache(jobId);
  SpreadsheetApp.getUi().alert(`Cache cleared for job ${jobId}. Next generate will re-fetch.`);
}

// ── Expose to GAS global scope ────────────────────────────────────────────────

const g = global as unknown as Record<string, unknown>;
g['onOpen'] = onOpen;
g['resumeURL'] = resumeURL;
g['testEmail'] = testEmail;
g['blurb'] = blurb;
g['sendEmails'] = sendEmailsFn;
g['queueEmails'] = queueEmailsFn;
g['fetchContactToSheet'] = fetchContactToSheet;
g['getLinkedInUrlToSheet'] = getLinkedInUrlToSheet;
g['sendWarmup'] = sendWarmup;
g['generateMessageForRow'] = generateMessageForRow;
g['refreshJobMetadata'] = refreshJobMetadataFn;

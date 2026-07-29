// GAS entry point — all functions assigned to global scope are callable from the sheet.
import { onOpen } from './ui/menu';
import { PROFILE } from './config/profile';
import { generateOutreachMessage, OutreachContext } from './services/message-generator';
import { sendEmails, sendTestEmail, queueEmails, doSendEmails, doSendTestEmail, createWarmupDrafts } from './services/gmail';
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

// ── Warmup ────────────────────────────────────────────────────────────────────

function sendWarmup(): void {
  createWarmupDrafts(pickRandomContacts());
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

function showJobMetadataFn(): void {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const activeRow = sheet.getActiveRange()?.getRow() ?? 2;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] as string[];
  const jobIdCol = headers.indexOf(COLS.JOB_ID);
  if (jobIdCol === -1) {
    SpreadsheetApp.getUi().alert(`No "${COLS.JOB_ID}" column found in this sheet.`);
    return;
  }
  const jobId = sheet.getRange(activeRow, jobIdCol + 1).getValue() as string;
  if (!jobId) {
    SpreadsheetApp.getUi().alert(`No JobID found in the "${COLS.JOB_ID}" column for this row.`);
    return;
  }
  const meta = getJobMetadata(jobId);
  if (!meta) {
    SpreadsheetApp.getUi().alert(`No metadata found for job ${jobId}. Check NGROK_SMS_URL in .env and redeploy.`);
    return;
  }
  const lines = [
    `jobId: ${jobId}`,
    `Company: ${meta.Company}`,
    `jobTitle: ${meta.jobTitle}`,
    `jobTitleShorthand: ${meta.jobTitleShorthand}`,
    `jobURL: ${meta.jobURL}`,
    `resumeURL: ${meta.resumeURL || '(empty)'}`,
    `thirdPersonBlurb: ${meta.thirdPersonBlurb ? meta.thirdPersonBlurb.slice(0, 80) + '…' : '(empty)'}`,
  ];
  SpreadsheetApp.getUi().alert(lines.join('\n'));
}

function refreshJobMetadataFn(): void {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const activeRow = sheet.getActiveRange()?.getRow() ?? 2;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] as string[];
  const jobIdCol = headers.indexOf(COLS.JOB_ID);
  if (jobIdCol === -1) {
    SpreadsheetApp.getUi().alert(`No "${COLS.JOB_ID}" column found in this sheet.`);
    return;
  }
  const jobId = sheet.getRange(activeRow, jobIdCol + 1).getValue() as string;
  if (!jobId) {
    SpreadsheetApp.getUi().alert(`No JobID found in the "${COLS.JOB_ID}" column for this row.`);
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
g['sendEmails'] = sendEmails;
g['sendTestEmail'] = sendTestEmail;
g['queueEmails'] = queueEmails;
g['doSendEmails'] = doSendEmails;
g['doSendTestEmail'] = doSendTestEmail;
g['fetchContactToSheet'] = fetchContactToSheet;
g['getLinkedInUrlToSheet'] = getLinkedInUrlToSheet;
g['sendWarmup'] = sendWarmup;
g['generateMessageForRow'] = generateMessageForRow;
g['refreshJobMetadata'] = refreshJobMetadataFn;
g['showJobMetadata'] = showJobMetadataFn;

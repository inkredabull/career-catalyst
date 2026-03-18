// Gmail-based email sending and mail merge.

import { COLS, SCRIPT_PROPS, SHEETS, SUBJECT_LINE_COLS, getFlagsForSubject } from '../config/settings';
import { getJobMetadata } from './job-metadata';
import { log } from '../utils/logger';
import {
  valediction, ideal, accomplishments, aboutMe, reciprocate,
  who, why, cmf, ask, connection, intro, followup, personalization,
} from '../config/messages';
import { PROFILE } from '../config/profile';
import { notifyViaSMS } from './sms';

interface MsgObj {
  subject: string;
  text: string;
  html: string;
}

interface SendParams {
  htmlBody: string;
  attachments?: GoogleAppsScript.Base.Blob[];
}

// ── Core send ─────────────────────────────────────────────────────────────────

export const emailDrivePdf = (driveUrl: string): GoogleAppsScript.Base.Blob => {
  const match = driveUrl.match(/[-\w]{25,}/);
  if (!match) throw new Error(`Could not extract Drive file ID from: ${driveUrl}`);
  const file = DriveApp.getFileById(match[0]);
  let filename = file.getName();
  if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';
  return file.getBlob().setName(filename);
};

const driveFileAsBlob = (driveUrl: string): GoogleAppsScript.Base.Blob => {
  const match = driveUrl.match(/[-\w]{25,}/);
  if (!match) throw new Error(`Could not extract Drive file ID from: ${driveUrl}`);
  const file = DriveApp.getFileById(match[0]);
  return file.getBlob().setName(file.getName());
};

export const sendViaGmail = (
  row: Record<string, string>,
  msgObj: MsgObj,
  emailTemplate?: { attachments: GoogleAppsScript.Base.Blob[] } | null
): void => {
  const subjectLine = msgObj.subject;
  Logger.log('Sending via Gmail: %s', subjectLine);

  // Get flags for this specific subject line
  const flags = getFlagsForSubject(subjectLine);

  const params: SendParams = { htmlBody: msgObj.html };

  if (emailTemplate) {
    params.attachments = emailTemplate.attachments;

    if (flags.ATTACH_RESUME) {
      const jobId = row[COLS.JOB_ID];
      const metaResumeUrl = jobId ? getJobMetadata(jobId)?.resumeURL : undefined;
      const fallbackResumeUrl = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.RESUME_URL);
      const resumeUrl = (metaResumeUrl?.includes('drive.google.com') ? metaResumeUrl : null)
        ?? (fallbackResumeUrl?.includes('drive.google.com') ? fallbackResumeUrl : null);

      if (resumeUrl) {
        params.attachments = [...emailTemplate.attachments, emailDrivePdf(resumeUrl)];
      }
    }
  }

  const photoUrl = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.PHOTO_URL);
  if (photoUrl && photoUrl.includes('drive.google.com')) {
    params.attachments = [...(params.attachments ?? []), driveFileAsBlob(photoUrl)];
  }

  GmailApp.sendEmail(row[COLS.RECIPIENT], subjectLine, msgObj.text, params);

  if (flags.SEND_SMS) {
    const phoneKey = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.MY_PHONE);
    const number = row[COLS.CELL] || phoneKey || '';
    const firstName = row[COLS.FIRST_NAME] || row[COLS.FULL_NAME]?.trim().split(/\s+/)[0] || '';
    notifyViaSMS(firstName, row[COLS.RECIPIENT], number);
  }
};

// ── Queue / bulk send ─────────────────────────────────────────────────────────

// ── Subject line picker ───────────────────────────────────────────────────────

const getSubjectLinesForPicker = (): string[] => {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.SUBJECT_LINES);
  if (!sheet) {
    Logger.log('Sheet "%s" not found', SHEETS.SUBJECT_LINES);
    return [];
  }
  const data = sheet.getDataRange().getValues();
  const heads = data.shift() as string[];
  const subjectCol = heads.indexOf(SUBJECT_LINE_COLS.SUBJECT);
  const showCol = heads.indexOf(SUBJECT_LINE_COLS.SHOW);
  if (subjectCol === -1 || showCol === -1) {
    Logger.log('Columns "%s" or "%s" not found in sheet "%s"',
      SUBJECT_LINE_COLS.SUBJECT, SUBJECT_LINE_COLS.SHOW, SHEETS.SUBJECT_LINES);
    return [];
  }
  return data
    .filter(row => String(row[showCol]).toLowerCase() === 'true')
    .map(row => String(row[subjectCol]))
    .filter(s => s.trim() !== '');
};

const buildSubjectPickerHtml = (subjects: string[], actionFn: string): string => {
  const subjectsJson = JSON.stringify(subjects);
  const fnJson = JSON.stringify(actionFn);
  return `<!DOCTYPE html><html><head><base target="_top"><style>
body{font-family:sans-serif;padding:16px;min-width:320px}
p{margin:0 0 6px}
select{width:100%;padding:6px;font-size:13px;margin-bottom:14px}
.btns{display:flex;gap:8px;justify-content:flex-end}
button{padding:6px 16px;cursor:pointer}
</style></head><body>
<p>Select a subject line:</p>
<select id="s"><option value="">-- Select --</option></select>
<div class="btns">
<button onclick="google.script.host.close()">Cancel</button>
<button onclick="doSubmit()">OK</button>
</div>
<script>
(function(){
var subjects=${subjectsJson};
var sel=document.getElementById('s');
subjects.forEach(function(s){var o=document.createElement('option');o.value=o.textContent=s;sel.appendChild(o);});
window.doSubmit=function(){
var s=sel.value;
if(!s){alert('Please select a subject line.');return;}
google.script.run
.withSuccessHandler(function(){google.script.host.close();})
.withFailureHandler(function(e){alert(e.message);})
[${fnJson}](s);
};
})();
</script></body></html>`;
};

const showSubjectPickerDialog = (action: 'send' | 'test'): void => {
  const subjects = getSubjectLinesForPicker();
  if (subjects.length === 0) {
    SpreadsheetApp.getUi().alert(
      `No subject lines found. Ensure the "${SHEETS.SUBJECT_LINES}" sheet exists ` +
      `with "${SUBJECT_LINE_COLS.SUBJECT}" and "${SUBJECT_LINE_COLS.SHOW}" columns, ` +
      `and at least one row has Show = TRUE.`
    );
    return;
  }
  const actionFn = action === 'send' ? 'doSendEmails' : 'doSendTestEmail';
  const html = HtmlService.createHtmlOutput(buildSubjectPickerHtml(subjects, actionFn))
    .setWidth(440)
    .setHeight(170);
  SpreadsheetApp.getUi().showModalDialog(html, 'Mail Merge — Choose Subject');
};

// ── Queue / bulk send ─────────────────────────────────────────────────────────

export const doSendTestEmail = (
  subject: string,
  sheet = SpreadsheetApp.getActiveSheet()
): void => {
  const testRecipient = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.TEST_EMAIL);
  if (!testRecipient) {
    Logger.log('TEST_EMAIL Script Property not set — aborting test send');
    return;
  }

  const emailTemplate = getGmailTemplateFromDrafts(subject);
  const data = sheet.getDataRange().getDisplayValues();
  const heads = data.shift() as string[];
  const rows = data.map(r =>
    heads.reduce<Record<string, string>>((o, k, i) => { o[k] = r[i] ?? ''; return o; }, {})
  );

  const row = rows[0];
  if (!row) {
    Logger.log('No data rows found in sheet — aborting test send');
    return;
  }

  row[COLS.RECIPIENT] = testRecipient;
  const msgObj = fillInTemplateFromObject(emailTemplate.message, row);
  sendViaGmail(row, msgObj, emailTemplate);
  Logger.log('Test email sent to %s', testRecipient);
};

export const sendTestEmail = (subjectLine?: string): void => {
  if (subjectLine) {
    doSendTestEmail(subjectLine);
  } else {
    showSubjectPickerDialog('test');
  }
};

export const queueEmails = (
  _subjectLine?: string,
  _sheet = SpreadsheetApp.getActiveSheet()
): void => {
  // Placeholder — queueing logic to be implemented
};

export const doSendEmails = (
  subject: string,
  sheet = SpreadsheetApp.getActiveSheet()
): void => {
  Logger.log('Getting draft: %s', subject);
  const emailTemplate = getGmailTemplateFromDrafts(subject);
  const data = sheet.getDataRange().getDisplayValues();
  const heads = data.shift() as string[];
  const emailSentColIdx = heads.indexOf(COLS.EMAIL_SENT);

  const rows = data.map(r =>
    heads.reduce<Record<string, string>>((o, k, i) => { o[k] = r[i] ?? ''; return o; }, {})
  );

  const out: [string | Date][] = [];

  for (const row of rows) {
    if (row[COLS.EMAIL_SENT] === '') {
      try {
        const msgObj = fillInTemplateFromObject(emailTemplate.message, row);
        sendViaGmail(row, msgObj, emailTemplate);
        out.push([new Date()]);
      } catch (e) {
        out.push([(e as Error).message]);
      }
    } else {
      out.push([row[COLS.EMAIL_SENT]]);
    }
  }

  sheet.getRange(2, emailSentColIdx + 1, out.length).setValues(out);
};

export const sendEmails = (subjectLine?: string): void => {
  if (subjectLine) {
    doSendEmails(subjectLine);
  } else {
    showSubjectPickerDialog('send');
  }
};

// ── Template helpers (private) ────────────────────────────────────────────────

const getGmailTemplateFromDrafts = (subjectLine: string): {
  message: MsgObj;
  attachments: GoogleAppsScript.Base.Blob[];
} => {
  const drafts = GmailApp.getDrafts();
  const draft = drafts.find(d => d.getMessage().getSubject() === subjectLine);
  if (!draft) throw new Error("Oops - can't find Gmail draft");
  const msg = draft.getMessage();
  return {
    message: { subject: subjectLine, text: msg.getPlainBody(), html: msg.getBody() },
    attachments: msg.getAttachments() as unknown as GoogleAppsScript.Base.Blob[],
  };
};

const escapeData = (str: string): string =>
  str
    .replace(/[\\]/g, '\\\\')
    .replace(/["]/g, '\\"')
    .replace(/[/]/g, '\\/')
    .replace(/[\b]/g, '\\b')
    .replace(/[\f]/g, '\\f')
    .replace(/[\n]/g, '\\n')
    .replace(/[\r]/g, '\\r')
    .replace(/[\t]/g, '\\t');

export const fillInTemplateFromObject = (template: MsgObj, data: Record<string, string>): MsgObj => {
  let s = JSON.stringify(template);

  // Stage 0: Fetch job metadata first so {{Blurb}} and {{Intro}} can use it below
  const jobId = data[COLS.JOB_ID];
  log('INFO', 'Stage 0: jobId=%s', jobId || '(empty — check JobID column in sheet)');
  if (jobId) {
    const meta = getJobMetadata(jobId);
    log('INFO', 'Stage 0: metadata %s', meta ? `found (company=${meta.Company})` : 'null — tokens will be empty');
    if (meta) {
      data['Company'] = meta.Company;
      data['JobTitleActual'] = meta.jobTitle;
      data['JobTitleShorthand'] = meta.jobTitleShorthand;
      data['JobURL'] = meta.jobURL;
      if (meta.thirdPersonBlurb) data['Blurb'] = meta.thirdPersonBlurb;
    }
  }

  // Stage 1: Named token substitutions (Blurb falls back to PROFILE if no job blurb)
  const subs: Record<string, string> = {
    '{{Valediction}}': valediction(),
    '{{Ideal}}': ideal(),
    '{{Accomplishment1}}': accomplishments(1),
    '{{Accomplishment2}}': accomplishments(2),
    '{{Accomplishment3}}': accomplishments(3),
    '{{Accomplishment4}}': accomplishments(4),
    '{{AboutMe}}': aboutMe(),
    '{{Reciprocate}}': reciprocate(),
    '{{Who}}': who(),
    '{{WhatAndWhere}}': aboutMe(),
    '{{Why}}': why(),
    '{{CMF}}': cmf(),
    '{{Ask}}': ask(),
    '{{Get}}': ask(),
    '{{Give}}': reciprocate(),
    '{{Followup}}': followup(),
    '{{Personalization}}': personalization(),
    '{{Blurb}}': data['Blurb'] || PROFILE.blurb[0],
    '{{Connection}}': connection(data['PersonName'], data['PersonURL']),
    '{{Intro}}': intro(data['PersonName'] ?? '', data['JobTitleActual'] ?? '', data['Blurb']),
  };

  for (const [token, value] of Object.entries(subs)) {
    s = s.replace(new RegExp(token.replace(/[{}]/g, '\\$&'), 'g'), escapeData(value));
  }

  // Stage 1.5: Derive First / L from Full Name if the dedicated columns are absent
  if (!data['First'] && data[COLS.FULL_NAME]) {
    const parts = data[COLS.FULL_NAME].trim().split(/\s+/);
    data['First'] = parts[0] ?? '';
    if (!data['L']) data['L'] = parts.length > 1 ? parts[parts.length - 1]! : '';
  }

  // Stage 2: Generic {{key}} replacement from row data
  s = s.replace(/{{[^{}]+}}/g, key => escapeData(data[key.replace(/[{}]+/g, '')] ?? ''));

  return JSON.parse(s) as MsgObj;
};

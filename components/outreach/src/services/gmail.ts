// Gmail-based email sending and mail merge.

import { COLS, FLAGS, SCRIPT_PROPS } from '../config/settings';
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

  const params: SendParams = { htmlBody: msgObj.html };

  if (emailTemplate) {
    params.attachments = emailTemplate.attachments;

    if (FLAGS.ATTACH_RESUME) {
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

  if (FLAGS.SEND_SMS) {
    const phoneKey = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.MY_PHONE);
    const number = row[COLS.CELL] || phoneKey || '';
    const firstName = row[COLS.FIRST_NAME] || row[COLS.FULL_NAME]?.trim().split(/\s+/)[0] || '';
    notifyViaSMS(firstName, row[COLS.RECIPIENT], number);
  }
};

// ── Queue / bulk send ─────────────────────────────────────────────────────────

export const queueEmails = (
  _subjectLine?: string,
  _sheet = SpreadsheetApp.getActiveSheet()
): void => {
  // Placeholder — queueing logic to be implemented
};

export const sendEmails = (
  subjectLine?: string,
  sheet = SpreadsheetApp.getActiveSheet()
): void => {
  let subject = subjectLine;

  if (!subject) {
    subject = Browser.inputBox(
      'Mail Merge',
      'Type or copy/paste the subject line of the Gmail draft message you would like to mail merge with:',
      Browser.Buttons.OK_CANCEL
    );
    if (subject === 'cancel' || subject === '') return;
  }

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

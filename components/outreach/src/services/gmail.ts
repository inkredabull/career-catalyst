// Gmail-based email sending and mail merge.

import { COLS, FLAGS, SCRIPT_PROPS } from '../config/settings';
import {
  valediction, ideal, accomplishments, aboutMe, reciprocate,
  who, whatAndWhere, why, cmf, ask, connection, intro, followup,
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

export function emailDrivePdf(): GoogleAppsScript.Base.Blob {
  const driveUrl = PROFILE.resumeURL;
  const match = driveUrl.match(/[-\w]{25,}/);
  if (!match) throw new Error('Could not extract Drive file ID from resume URL');
  const file = DriveApp.getFileById(match[0]);
  let filename = file.getName();
  if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';
  return file.getBlob().setName(filename);
}

export function sendViaGmail(
  row: Record<string, string>,
  msgObj: MsgObj,
  emailTemplate?: { attachments: GoogleAppsScript.Base.Blob[] } | null
): void {
  const subjectLine = msgObj.subject;
  Logger.log('Sending via Gmail: %s', subjectLine);

  const params: SendParams = { htmlBody: msgObj.html };

  const blob = emailDrivePdf();
  if (emailTemplate && FLAGS.ATTACH_RESUME) {
    params.attachments = [...emailTemplate.attachments, blob];
  } else if (emailTemplate?.attachments) {
    params.attachments = emailTemplate.attachments;
  }

  GmailApp.sendEmail(row[COLS.RECIPIENT], subjectLine, msgObj.text, params);

  if (FLAGS.SEND_SMS) {
    const phoneKey = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.MY_PHONE);
    const number = row[COLS.CELL] || phoneKey || '';
    notifyViaSMS(row[COLS.FIRST_NAME], row[COLS.RECIPIENT], number);
  }
}

// ── Queue / bulk send ─────────────────────────────────────────────────────────

export function queueEmails(
  _subjectLine?: string,
  _sheet = SpreadsheetApp.getActiveSheet()
): void {
  // Placeholder — queueing logic to be implemented
}

export function sendEmails(
  subjectLine?: string,
  sheet = SpreadsheetApp.getActiveSheet()
): void {
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
}

// ── Template helpers (private) ────────────────────────────────────────────────

function getGmailTemplateFromDrafts(subjectLine: string): {
  message: MsgObj;
  attachments: GoogleAppsScript.Base.Blob[];
} {
  const drafts = GmailApp.getDrafts();
  const draft = drafts.find(d => d.getMessage().getSubject() === subjectLine);
  if (!draft) throw new Error("Oops - can't find Gmail draft");
  const msg = draft.getMessage();
  return {
    message: { subject: subjectLine, text: msg.getPlainBody(), html: msg.getBody() },
    attachments: msg.getAttachments() as unknown as GoogleAppsScript.Base.Blob[],
  };
}

function escapeData(str: string): string {
  return str
    .replace(/[\\]/g, '\\\\')
    .replace(/["]/g, '\\"')
    .replace(/[/]/g, '\\/')
    .replace(/[\b]/g, '\\b')
    .replace(/[\f]/g, '\\f')
    .replace(/[\n]/g, '\\n')
    .replace(/[\r]/g, '\\r')
    .replace(/[\t]/g, '\\t');
}

function fillInTemplateFromObject(template: MsgObj, data: Record<string, string>): MsgObj {
  let s = JSON.stringify(template);

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
    '{{WhatAndWhere}}': whatAndWhere(),
    '{{Why}}': why(),
    '{{CMF}}': cmf(),
    '{{Ask}}': ask(),
    '{{Get}}': ask(),
    '{{Give}}': reciprocate(),
    '{{Followup}}': followup(),
    '{{Blurb}}': PROFILE.blurb[0],
    '{{Connection}}': connection(data['PersonName'], data['PersonURL']),
    '{{Intro}}': intro(data['PersonName'] ?? '', data['JobTitleActual'] ?? '', data['Blurb']),
  };

  for (const [token, value] of Object.entries(subs)) {
    s = s.replace(new RegExp(token.replace(/[{}]/g, '\\$&'), 'g'), escapeData(value));
  }

  // Generic token replacement from row data
  s = s.replace(/{{[^{}]+}}/g, key => escapeData(data[key.replace(/[{}]+/g, '')] ?? ''));

  return JSON.parse(s) as MsgObj;
}

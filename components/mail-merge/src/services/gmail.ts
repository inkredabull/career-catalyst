// Gmail-based email sending and mail merge.

import { COLS, SCRIPT_PROPS, SUBJECT_LINES, getFlagsForSubject } from '../config/settings';
import { getJobMetadata } from './job-metadata';
import { log } from '../utils/logger';
import {
  valediction, ideal, accomplishments, aboutMe, reciprocate,
  who, why, cmf, ask, connection, intro, followup, personalization,
} from '../config/messages';
import { PROFILE } from '../config/profile';
import { notifyViaSMS, buildSmsMessage, normalizePhoneNumber } from './sms';
import { getLinkedInUrlByName, WarmupContact } from './contacts';

interface MsgObj {
  subject: string;
  text: string;
  html: string;
}

interface SendParams {
  htmlBody: string;
  attachments?: GoogleAppsScript.Base.Blob[];
}

// ── LinkedIn DM modal ─────────────────────────────────────────────────────────

interface LinkedInContact {
  url: string;
  message: string;
  firstName: string;
}

/** True if `email` is the same mailbox as `myEmail`, ignoring plus-addressing (e.g. anthony+test@bluxomelabs.com). */
const isSelfEmailVariant = (email: string, myEmail: string): boolean => {
  if (!email || !myEmail) return false;
  const normalize = (e: string): string => {
    const [local, domain] = e.toLowerCase().trim().split('@');
    if (!domain) return e.toLowerCase().trim();
    return `${local.split('+')[0]}@${domain}`;
  };
  return normalize(email) === normalize(myEmail);
};

/** Opens each LinkedIn profile in a new tab and auto-closes after 2 s.
 *  Requires popups allowed for docs.google.com (one-time browser setting). */
const openLinkedInTabs = (contacts: LinkedInContact[]): void => {
  const contactsJson = JSON.stringify(contacts);
  const withUrl = contacts.filter(c => c.url).length;
  const html = `<!DOCTYPE html><html><head><base target="_top"><style>
body{font-family:sans-serif;padding:16px;font-size:13px;color:#333}
h3{margin:0 0 8px;font-size:14px}
ul{margin:8px 0 0;padding-left:18px}
li{margin-bottom:6px}
</style></head><body>
<h3 id="status">Opening ${withUrl} LinkedIn profile(s)\u2026</h3>
<ul id="list"></ul>
<script>
var contacts=${contactsJson};
// Send contacts+messages to content.js in the outermost docs.google.com frame,
// which bridges them to the extension background for storage keyed by LinkedIn slug.
// Use window.top (not window.parent) since this dialog can be nested more than one iframe deep.
window.top.postMessage({type:'CC_LI_MESSAGES',contacts:contacts},'*');
// Random delay between tab opens, same range as components/networker/src/commands/send.ts,
// to avoid opening all LinkedIn tabs at once (looks less bot-like, easier on LinkedIn rate limits).
function randomDelay(min,max){return new Promise(function(r){setTimeout(r, Math.floor(Math.random()*(max-min+1))+min);});}
(async function(){
  for (var i=0;i<contacts.length;i++){
    var c=contacts[i];
    if(c.url) window.open(c.url,'_blank');
    var li=document.createElement('li');
    li.innerHTML='<strong>'+c.firstName+'</strong>'+(c.url?' \u2197':' (no URL)');
    document.getElementById('list').appendChild(li);
    if(i<contacts.length-1) await randomDelay(1600,3750);
  }
  setTimeout(function(){google.script.host.close();},2000);
})();
</script>
</body></html>`;

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(420).setHeight(Math.min(80 + contacts.length * 60, 400)),
    `LinkedIn (${contacts.length})`
  );
};

// ── Warmup draft creation ─────────────────────────────────────────────────────

const WARMUP_TEMPLATE = 'Catching up + a quick ask';

export const createWarmupDrafts = (contacts: WarmupContact[]): void => {
  const myEmail = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.MY_EMAIL) ?? '';
  const emailTemplate = getGmailTemplateFromDrafts(WARMUP_TEMPLATE);
  const flags = getFlagsForSubject(WARMUP_TEMPLATE);

  const attachments: GoogleAppsScript.Base.Blob[] = [...emailTemplate.attachments];
  if (flags.ATTACH_PHOTO) {
    const photoUrl = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.PHOTO_URL);
    if (photoUrl && photoUrl.includes('drive.google.com')) {
      attachments.push(driveFileAsBlob(photoUrl));
    }
  }

  const draftLines: string[] = [];

  for (const { displayName, contactUrl, email } of contacts) {
    if (!email) {
      Logger.log('Skipping warmup draft for %s — no email address', displayName);
      draftLines.push(`${displayName} (no email — draft skipped)\n${contactUrl}`);
      continue;
    }
    const parts = displayName.trim().split(/\s+/);
    const row: Record<string, string> = {
      [COLS.RECIPIENT]: email,
      [COLS.FULL_NAME]: displayName,
      [COLS.FIRST_NAME]: parts[0] ?? '',
      ContactURL: contactUrl,
    };
    const msgObj = fillInTemplateFromObject(emailTemplate.message, row, WARMUP_TEMPLATE);
    GmailApp.createDraft(email, msgObj.subject, msgObj.text, { htmlBody: msgObj.html, attachments });
    Logger.log('Created warmup draft for %s (%s)', displayName, email);

    const draftSearchUrl = `https://mail.google.com/mail/u/0/#search/in:drafts+to:${encodeURIComponent(email)}`;
    draftLines.push(`${displayName} (${email})\n${draftSearchUrl}`);
  }

  const body = draftLines.join('\n\n');
  GmailApp.sendEmail(myEmail, 'Morning Warmup', body);
  Logger.log('Sent warmup confirmation email to %s', myEmail);
};

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
  emailTemplate?: { attachments: GoogleAppsScript.Base.Blob[] } | null,
  draftSubject?: string
): LinkedInContact | null => {
  const subjectLine = msgObj.subject;
  Logger.log('Sending via Gmail: %s', subjectLine);

  // Use the original draft subject (with tokens) for flag lookup so template-based keys match
  const flags = getFlagsForSubject(draftSubject ?? subjectLine);

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

  if (flags.ATTACH_PHOTO) {
    const photoUrl = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.PHOTO_URL);
    if (photoUrl && photoUrl.includes('drive.google.com')) {
      params.attachments = [...(params.attachments ?? []), driveFileAsBlob(photoUrl)];
    }
  }

  GmailApp.sendEmail(row[COLS.RECIPIENT], subjectLine, msgObj.text, params);

  if (flags.SEND_SMS) {
    const myPhone = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.MY_PHONE) ?? '';
    const cellValue = (row[COLS.CELL] ?? '').trim();
    const firstName = row[COLS.FIRST_NAME] || row[COLS.FULL_NAME]?.trim().split(/\s+/)[0] || '';

    Logger.log('SMS Logic - myPhone: "%s", cellValue: "%s", firstName: "%s"', myPhone, cellValue, firstName);

    const isSelfOrMissing = !cellValue || (() => {
      try { return myPhone !== '' && normalizePhoneNumber(cellValue) === normalizePhoneNumber(myPhone); }
      catch { return false; }
    })();

    Logger.log('SMS Logic - isSelfOrMissing: %s', isSelfOrMissing);

    if (isSelfOrMissing) {
      const myEmail = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.MY_EMAIL) ?? '';
      if (isSelfEmailVariant(row[COLS.RECIPIENT], myEmail)) {
        Logger.log('Recipient "%s" is a self-test variant of MY_EMAIL — skipping LinkedIn tab', row[COLS.RECIPIENT]);
        return null;
      }

      const linkedInUrl = row[COLS.LINKEDIN] || getLinkedInUrlByName(row[COLS.FULL_NAME] || firstName) || '';
      const message = buildSmsMessage(firstName, row[COLS.RECIPIENT], "making a connection");
      Logger.log('Queuing LinkedIn contact - URL: "%s", Message length: %s', linkedInUrl, message.length);
      return { url: linkedInUrl, message, firstName };
    } else {
      Logger.log('Sending SMS to: %s', cellValue);
      notifyViaSMS(firstName, row[COLS.RECIPIENT], cellValue, "making a connection");
    }
  }
  return null;
};

// ── Queue / bulk send ─────────────────────────────────────────────────────────

// ── Subject line picker ───────────────────────────────────────────────────────

interface SubjectOption {
  value: string;
  label: string;
}

const getSubjectOptionsForPicker = (): SubjectOption[] =>
  SUBJECT_LINES.map(subject => {
    const flags = getFlagsForSubject(subject);
    const sms = flags.SEND_SMS ? '🟢' : '🔴';
    const resume = flags.ATTACH_RESUME ? '🟢' : '🔴';
    const photo = flags.ATTACH_PHOTO ? '🟢' : '🔴';
    return { value: subject, label: `${sms}📱 ${resume}📎 ${photo}🖼️  ${subject}` };
  });

const buildSubjectPickerHtml = (options: SubjectOption[], actionFn: string): string => {
  const optionsJson = JSON.stringify(options);
  const fnJson = JSON.stringify(actionFn);
  return `<!DOCTYPE html><html><head><base target="_top"><style>
body{font-family:sans-serif;padding:16px;min-width:320px}
p{margin:0 0 6px}
select{width:100%;padding:6px;font-size:13px;margin-bottom:14px}
.btns{display:flex;gap:8px;justify-content:flex-end}
button{padding:6px 16px;cursor:pointer}
#loading{display:none;text-align:center;padding:12px 0;color:#555;font-size:14px}
.spinner{display:inline-block;margin-right:6px;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style></head><body>
<div id="form">
<p>Select a subject line:</p>
<select id="s"><option value="">-- Select --</option></select>
<div class="btns">
<button id="cancel" onclick="google.script.host.close()">Cancel</button>
<button id="ok" onclick="doSubmit()">OK</button>
</div>
</div>
<div id="loading"><span class="spinner">⏳</span>Sending emails — please wait…</div>
<script>
(function(){
var options=${optionsJson};
var sel=document.getElementById('s');
options.forEach(function(o){var el=document.createElement('option');el.value=o.value;el.textContent=o.label;sel.appendChild(el);});
window.doSubmit=function(){
var s=sel.value;
if(!s){alert('Please select a subject line.');return;}
document.getElementById('form').style.display='none';
document.getElementById('loading').style.display='block';
google.script.run
.withSuccessHandler(function(){google.script.host.close();})
.withFailureHandler(function(e){
document.getElementById('loading').style.display='none';
document.getElementById('form').style.display='block';
alert(e.message);
})
[${fnJson}](s);
};
})();
</script></body></html>`;
};

const showSubjectPickerDialog = (action: 'send' | 'test'): void => {
  const options = getSubjectOptionsForPicker();
  if (options.length === 0) {
    SpreadsheetApp.getUi().alert('No subject lines configured. Add entries to SUBJECT_LINES in settings.ts.');
    return;
  }
  const actionFn = action === 'send' ? 'doSendEmails' : 'doSendTestEmail';
  const html = HtmlService.createHtmlOutput(buildSubjectPickerHtml(options, actionFn))
    .setWidth(500)
    .setHeight(185);
  SpreadsheetApp.getUi().showModalDialog(html, 'Choose Subject');
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
  const msgObj = fillInTemplateFromObject(emailTemplate.message, row, subject);
  const linkedin = sendViaGmail(row, msgObj, emailTemplate, subject);
  if (linkedin) openLinkedInTabs([linkedin]);
  Logger.log('Test email sent to %s', testRecipient);
  SpreadsheetApp.getActive().toast(`Test sent to ${testRecipient}`, '✅ Test Email Sent', 5);
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
  let sentCount = 0;
  const linkedInContacts: LinkedInContact[] = [];

  for (const row of rows) {
    if (row[COLS.EMAIL_SENT] === '') {
      try {
        const msgObj = fillInTemplateFromObject(emailTemplate.message, row, subject);
        const linkedin = sendViaGmail(row, msgObj, emailTemplate, subject);
        if (linkedin) linkedInContacts.push(linkedin);
        out.push([new Date()]);
        sentCount++;
      } catch (e) {
        out.push([(e as Error).message]);
      }
    } else {
      out.push([row[COLS.EMAIL_SENT]]);
    }
  }

  sheet.getRange(2, emailSentColIdx + 1, out.length).setValues(out);
  SpreadsheetApp.getActive().toast(`Sent ${sentCount} email(s)`, '✅ Mail Merge Complete', 5);

  if (linkedInContacts.length > 0) {
    openLinkedInTabs(linkedInContacts);
  }
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

export const fillInTemplateFromObject = (template: MsgObj, data: Record<string, string>, subjectLine?: string): MsgObj => {
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
    '{{Valediction}}': valediction(subjectLine),
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

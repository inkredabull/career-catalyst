// Gmail-based email sending and mail merge.

import { COLS, SCRIPT_PROPS, SUBJECT_LINES, getFlagsForSubject, getTopicForSubject } from '../config/settings';
import { getJobMetadata, checkMetadataServer } from './job-metadata';
import { log } from '../utils/logger';
import { clearProgress, pushProgress } from '../utils/progress';
import {
  valediction, ideal, accomplishments, aboutMe, reciprocate, calendlyURL,
  why, cmf, ask, connection, intro, followup, personalization,
} from '../config/messages';
import { PROFILE } from '../config/profile';
import { notifyViaSMS, buildSmsMessage, normalizePhoneNumber } from './sms';
import { getLinkedInUrlByName, WarmupContact } from './contacts';
import { containsTokens, draftsMatchingSubject, hasUnresolvedTokens, selectTemplateDraft, TemplateMessage } from './draft-template';
import { NGROK_TUNNEL_URL } from '../config/env';

interface MsgObj {
  subject: string;
  text: string;
  html: string;
}

interface SendParams {
  attachments?: GoogleAppsScript.Base.Blob[];
}

/** Thrown by fillInTemplateFromObject when a token would render blank. Always raised *before*
 *  anything is sent, so the row is untouched and safe to retry once the cause is fixed. */
export class UnresolvedTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnresolvedTemplateError';
  }
}

/** Tokens allowed to render empty. Everything else aborts the row — new columns are
 *  required by default, which is the point: an unfilled token must never reach a recipient. */
const OPTIONAL_TOKENS = new Set([
  'PersonName', 'PersonURL', 'ContactURL', 'LinkedIn', 'Cell', 'L', 'Recent', 'Subject', 'Zeitgeisty', 'Company'
]);

// ── LinkedIn DM modal ─────────────────────────────────────────────────────────

interface LinkedInContact {
  url: string;
  message: string;
  firstName: string;
}

/** Payload shape accepted by unified-server POST /linkedin-reminder. */
interface ReminderPayload {
  title: string;
  notes: string;
  priority: number;
  dueDate: string;
  dueTime: string;
  listName: string;
  tags: string[];
  url: string;
}

const REMINDER_LIST = '2. Build with purpose';
const REMINDER_TAGS = ['KR-Get-a-new-job'];
const FOLLOWUP_DAYS = 3;

/** Gmail search for the message that was just sent, so the reminder links to the real thread. */
const sentEmailSearchUrl = (subject: string, recipient: string): string =>
  'https://mail.google.com/mail/u/0/#search/'
  + encodeURIComponent(`in:sent subject:"${subject}" to:${recipient}`);

/** Follow-up reminder for one recipient, due FOLLOWUP_DAYS after the send that just happened.
 *  `sentSubject` is the rendered subject (tokens filled), which is what the mailbox search needs. */
const buildFollowUpReminder = (
  row: Record<string, string>,
  sentSubject: string
): ReminderPayload => {
  const recipient = row[COLS.RECIPIENT] ?? '';
  const fullName = row[COLS.FULL_NAME]?.trim() || row[COLS.FIRST_NAME]?.trim() || recipient;
  const due = new Date();
  due.setDate(due.getDate() + FOLLOWUP_DAYS);
  const url = sentEmailSearchUrl(sentSubject, recipient);

  return {
    title: `Followup with: ${fullName}`,
    notes: `Follow up on outreach to ${fullName}.\n\nSent emails: ${url}`,
    priority: 5,
    dueDate: Utilities.formatDate(due, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    dueTime: '12:00',
    listName: REMINDER_LIST,
    tags: REMINDER_TAGS,
    url,
  };
};

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

/** Opens each LinkedIn profile in a new tab and hands any reminders to the extension, then
 *  auto-closes after 2 s.
 *
 *  Reminders have to travel through the browser: Apps Script runs on Google's servers and
 *  UrlFetchApp cannot reach the unified-server on localhost, but content.js (running in this
 *  docs.google.com tab) can. Same bridge the LinkedIn messages already use.
 *
 *  Requires popups allowed for docs.google.com (one-time browser setting). */
const handOffToExtension = (
  contacts: LinkedInContact[],
  reminders: ReminderPayload[] = []
): void => {
  const contactsJson = JSON.stringify(contacts);
  const remindersJson = JSON.stringify(reminders);
  const withUrl = contacts.filter(c => c.url).length;
  const headline = [
    withUrl > 0 ? `Opening ${withUrl} LinkedIn profile(s)` : '',
    reminders.length > 0 ? `queueing ${reminders.length} reminder(s)` : '',
  ].filter(Boolean).join(', ');
  const html = `<!DOCTYPE html><html><head><base target="_top"><style>
body{font-family:sans-serif;padding:16px;font-size:13px;color:#333}
h3{margin:0 0 8px;font-size:14px}
ul{margin:8px 0 0;padding-left:18px}
li{margin-bottom:6px}
</style></head><body>
<h3 id="status">${headline}\u2026</h3>
<ul id="list"></ul>
<script>
var contacts=${contactsJson};
var reminders=${remindersJson};
// Send contacts+messages to content.js in the outermost docs.google.com frame,
// which bridges them to the extension background for storage keyed by LinkedIn slug.
// Use window.top (not window.parent) since this dialog can be nested more than one iframe deep.
window.top.postMessage({type:'CC_LI_MESSAGES',contacts:contacts},'*');
// Reminders go to the same bridge, which POSTs them to the local unified-server. This continues
// in the docs.google.com tab after the dialog closes, so leave that tab open until it finishes.
if(reminders.length) window.top.postMessage({type:'CC_REMINDERS',reminders:reminders},'*');
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

  SpreadsheetApp.getUi().showModelessDialog(
    HtmlService.createHtmlOutput(html).setWidth(1).setHeight(1),
    ' '
  );
};

// ── Warmup draft creation ─────────────────────────────────────────────────────

const WARMUP_TEMPLATE = "Quick Favor - Exploring What's Next";

/** Short link to unified-server's /n/:id, which looks up a payload previously stashed there by
 *  registerLinkedInNudge and re-triggers the same CC_LI_MESSAGES bridge the bulk "Send Emails"
 *  flow posts from its GAS dialog — but reachable from a plain email link, since the warmup
 *  trigger runs headless with no open Sheets tab to postMessage from. Empty when there's no
 *  server to route through or no id to look up. */
export const buildNudgeShortLink = (baseUrl: string, id: string): string =>
  (!baseUrl || !id) ? '' : `${baseUrl}/n/${id}`;

/** Registers {url, message, firstName} under `id` with unified-server ahead of time, so the
 *  digest email can carry a short /n/<id> link (built via buildNudgeShortLink) instead of one
 *  with the message text spelled out in a query string. Returns false (logged, not thrown) on
 *  any failure, so a down server just means no LinkedIn line for this contact rather than
 *  aborting the whole warmup run. */
export const registerLinkedInNudge = (
  baseUrl: string, id: string, linkedinUrl: string, message: string, firstName: string
): boolean => {
  if (!baseUrl) return false;
  try {
    const response = UrlFetchApp.fetch(`${baseUrl}/warmup-linkedin-nudge`, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'ngrok-skip-browser-warning': '1' },
      payload: JSON.stringify({ id, url: linkedinUrl, message, firstName }),
      muteHttpExceptions: true,
    });
    if (response.getResponseCode() !== 200) {
      log(
        'ERROR', 'Failed to register LinkedIn nudge for %s [%s]: %s',
        id, response.getResponseCode(), response.getContentText().slice(0, 200)
      );
      return false;
    }
    return true;
  } catch (e) {
    log('ERROR', 'Network error registering LinkedIn nudge for %s: %s', id, e);
    return false;
  }
};

/** Short, URL-safe id for a registered nudge — doesn't need to be globally unguessable, just
 *  distinct enough to avoid collisions across the handful of contacts in a single warmup run. */
const generateNudgeId = (): string => Utilities.getUuid().replace(/-/g, '').slice(0, 12);

export const createWarmupDrafts = (contacts: WarmupContact[]): void => {
  const myEmail = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.MY_EMAIL) ?? '';
  const emailTemplate = getGmailTemplateFromDrafts(WARMUP_TEMPLATE);
  const flags = getFlagsForSubject(WARMUP_TEMPLATE);

  // Every warmup draft carries the template's subject, so a stale mailbox can leave nothing but
  // already-rendered copies to pick from. Bail with a report rather than create N drafts that all
  // greet the same person.
  if (!containsTokens(emailTemplate.message.text) && !containsTokens(emailTemplate.message.html)) {
    const problem = `No draft titled "${WARMUP_TEMPLATE}" still contains {{tokens}} — every match looks like an `
      + 'already-personalized copy. Restore the template draft (or delete the copies) and re-run.';
    log('WARN', problem);
    GmailApp.sendEmail(myEmail, 'Morning Warmup — no drafts created', problem);
    return;
  }

  const attachments: GoogleAppsScript.Base.Blob[] = [...emailTemplate.attachments];
  if (flags.ATTACH_PHOTO) {
    const photoUrl = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.PHOTO_URL);
    if (photoUrl && photoUrl.includes('drive.google.com')) {
      attachments.push(driveFileAsBlob(photoUrl));
    }
  }

  const draftLines: string[] = [];

  for (const { displayName, contactUrl, email, linkedinUrl } of contacts) {
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
    let msgObj: MsgObj;
    try {
      msgObj = fillInTemplateFromObject(emailTemplate.message, row, WARMUP_TEMPLATE);
    } catch (e) {
      // Skip this contact rather than aborting the run and losing the confirmation email.
      Logger.log('Skipping warmup draft for %s — %s', displayName, (e as Error).message);
      draftLines.push(`${displayName} (draft skipped — ${(e as Error).message})\n${contactUrl}`);
      continue;
    }
    GmailApp.createDraft(email, msgObj.subject, msgObj.text, { htmlBody: msgObj.html, attachments });
    Logger.log('Created warmup draft for %s (%s)', displayName, email);

    const draftSearchUrl = `https://mail.google.com/mail/u/0/#search/in:drafts+to:${encodeURIComponent(email)}`;
    const firstName = parts[0] ?? '';
    let linkedInLine = '';
    if (linkedinUrl && NGROK_TUNNEL_URL) {
      const topic = getTopicForSubject(WARMUP_TEMPLATE);
      const nudgeMessage = buildSmsMessage(firstName, email, '', topic);
      const nudgeId = generateNudgeId();
      if (registerLinkedInNudge(NGROK_TUNNEL_URL, nudgeId, linkedinUrl, nudgeMessage, firstName)) {
        linkedInLine = `\nLinkedIn: ${buildNudgeShortLink(NGROK_TUNNEL_URL, nudgeId)}`;
      }
    }
    draftLines.push(`${displayName} (${email})\nDraft: ${draftSearchUrl}${linkedInLine}\nContacts: ${contactUrl}`);
  }

  const body = draftLines.join('\n\n');
  GmailApp.sendEmail(myEmail, 'Morning Warmup', body);
  Logger.log('Sent warmup confirmation email to %s', myEmail);
};

// ── Core send ─────────────────────────────────────────────────────────────────

const time = <T>(scope: string, label: string, fn: () => T): T => {
  pushProgress(scope, `${label}…`);
  const start = Date.now();
  const result = fn();
  pushProgress(scope, `${label} — ${Date.now() - start}ms`);
  return result;
};

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
  draftSubject?: string,
  topic?: string,
  scope?: string,
): LinkedInContact | null => {
  const subjectLine = msgObj.subject;
  log('DEBUG', 'Sending via Gmail: %s', subjectLine);

  // Use the original draft subject (with tokens) for flag lookup so template-based keys match
  const flags = getFlagsForSubject(draftSubject ?? subjectLine);

  const params: SendParams = {};

  if (emailTemplate) {
    params.attachments = emailTemplate.attachments;

    if (flags.ATTACH_RESUME) {
      const jobId = row[COLS.JOB_ID];
      const metaResumeUrl = jobId ? getJobMetadata(jobId, scope)?.resumeURL : undefined;
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

  if (scope) pushProgress(scope, `Sending via Gmail to ${row[COLS.RECIPIENT]}…`);
  GmailApp.sendEmail(row[COLS.RECIPIENT], subjectLine, msgObj.text, {
    htmlBody: msgObj.html,
    attachments: params.attachments,
  });

  const firstName = row[COLS.FIRST_NAME] || row[COLS.FULL_NAME]?.trim().split(/\s+/)[0] || '';
  const myEmail = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.MY_EMAIL) ?? '';

  if (flags.SEND_SMS) {
    const myPhone = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.MY_PHONE) ?? '';
    const cellValue = (row[COLS.CELL] ?? '').trim();

    log('TRACE', 'SMS Logic - myPhone: "%s", cellValue: "%s", firstName: "%s"', myPhone, cellValue, firstName);

    const isSelfOrMissing = !cellValue || (() => {
      try { return myPhone !== '' && normalizePhoneNumber(cellValue) === normalizePhoneNumber(myPhone); }
      catch { return false; }
    })();

    log('TRACE', 'SMS Logic - isSelfOrMissing: %s', isSelfOrMissing);

    if (!isSelfOrMissing) {
      log('TRACE', 'Sending SMS to: %s', cellValue);
      if (scope) pushProgress(scope, `Sending SMS notification for ${row[COLS.RECIPIENT]}…`);
      notifyViaSMS(firstName, row[COLS.RECIPIENT], cellValue, row[COLS.ZEITGEISTY] ?? '', topic ?? draftSubject ?? subjectLine);
    }
  }

  // Always open LinkedIn profile after send, regardless of SMS flag.
  if (isSelfEmailVariant(row[COLS.RECIPIENT], myEmail)) {
    log('TRACE', 'Recipient "%s" is a self-test variant of MY_EMAIL — skipping LinkedIn tab', row[COLS.RECIPIENT]);
    return null;
  }
  if (!row[COLS.LINKEDIN] && scope) pushProgress(scope, `Looking up LinkedIn URL for ${row[COLS.FULL_NAME] || firstName}…`);
  const linkedInUrl = row[COLS.LINKEDIN] || getLinkedInUrlByName(row[COLS.FULL_NAME] || firstName) || '';
  const resolvedTopic = topic ?? draftSubject ?? subjectLine;
  const message = buildSmsMessage(firstName, row[COLS.RECIPIENT], row[COLS.ZEITGEISTY] ?? '', resolvedTopic);
  log('TRACE', 'Queuing LinkedIn contact - URL: "%s", Message length: %s', linkedInUrl, message.length);
  return { url: linkedInUrl, message, firstName };
};

// ── Queue / bulk send ─────────────────────────────────────────────────────────

// ── Subject line picker ───────────────────────────────────────────────────────

interface SubjectOption {
  value: string;
  label: string;
  topic: string;
}

const DEFAULT_TOPIC = 'making a connection';

const getSubjectOptionsForPicker = (): SubjectOption[] =>
  SUBJECT_LINES.map(subject => {
    const flags = getFlagsForSubject(subject);
    const sms = flags.SEND_SMS ? '🟢' : '🔴';
    const resume = flags.ATTACH_RESUME ? '🟢' : '🔴';
    const photo = flags.ATTACH_PHOTO ? '🟢' : '🔴';
    return { value: subject, label: `${sms}📱 ${resume}📎 ${photo}🖼️  ${subject}`, topic: getTopicForSubject(subject) };
  });

const buildSubjectPickerHtml = (options: SubjectOption[], actionFn: string): string => {
  const count = options.length;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  // Pre-render options server-side; topic encoded in value as "subject|||topic"
  const optionEls = options
    .map(o => `<option value="${esc(o.value + '|||' + o.topic)}">${esc(o.label)}</option>`)
    .join('');
  // All JS lives in inline event attributes — GAS HtmlService strips <script> blocks.
  // window._* globals let the poll callback and the success/failure handlers share state.
  const okOnclick = [
    "var sel=document.getElementById('s');",
    "var tin=document.getElementById('t');",
    "var parts=sel.value.split('|||');",
    "var s=parts[0];",
    "if(!s){alert('Please select a subject line.');return;}",
    "var t=(tin.value||'').trim()||parts[1]||'" + DEFAULT_TOPIC + "';",
    "if(typeof google==='undefined'||!google.script){alert('GAS not ready — please reload.');return;}",
    "document.getElementById('form').style.display='none';",
    "document.getElementById('loading').style.display='block';",
    // A fresh, never-before-used token per send means the first poll can never see a prior run's
    // leftover progress lines — no shared/static key to race against clearProgress() on the server.
    "var runToken=String(Date.now())+'-'+Math.random().toString(36).slice(2);",
    "window._shownCount=0;",
    "window._logDiv=document.getElementById('log');",
    "window._logDiv.textContent='';",
    "window._poll=function(){google.script.run.withSuccessHandler(function(lines){var all=lines||[];var fresh=all.slice(window._shownCount);if(fresh.length){if(window._shownCount>0)window._logDiv.textContent+='\\n';window._logDiv.textContent+=fresh.join('\\n');window._shownCount=all.length;window._logDiv.scrollTop=window._logDiv.scrollHeight;}}).withFailureHandler(function(){}).getSendProgress('send:'+runToken);};",
    "window._poll();",
    "window._timer=setInterval(window._poll,1000);",
    `google.script.run.withSuccessHandler(function(){clearInterval(window._timer);window._poll();setTimeout(function(){google.script.host.close();},2000);}).withFailureHandler(function(e){clearInterval(window._timer);window._poll();document.getElementById('form').style.display='block';document.getElementById('loading').style.display='none';alert(e.message);}).${actionFn}(s,t,runToken);`,
  ].join('');
  return `<!DOCTYPE html><html><head><base target="_top"><style>
body{font-family:sans-serif;padding:16px;min-width:320px}
p{margin:0 0 4px;font-size:13px}
select,input[type=text]{width:100%;padding:6px;font-size:13px;box-sizing:border-box}
select{margin-bottom:10px}
input[type=text]{margin-bottom:14px;border:1px solid #ccc;border-radius:3px}
.btns{display:flex;gap:8px;justify-content:flex-end}
button{padding:6px 16px;cursor:pointer}
#loading{display:none;text-align:center;padding:12px 0;color:#555;font-size:14px}
.spinner{display:inline-block;margin-right:6px;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
#log{margin-top:10px;height:160px;overflow-y:auto;background:#f7f7f7;border:1px solid #ddd;border-radius:3px;padding:6px;font-family:monospace;font-size:11px;white-space:pre-wrap;text-align:left}
</style></head><body>
<div id="form">
<p>Select a subject line (${count} loaded):</p>
<select id="s" onchange="var p=this.value.split('|||');document.getElementById('t').value=p[1]||''"><option value="">-- Select --</option>${optionEls}</select>
<p>Topic (used in SMS / LinkedIn message):</p>
<input type="text" id="t" placeholder="${DEFAULT_TOPIC}">
<div class="btns">
<button id="cancel" onclick="google.script.host.close()">Cancel</button>
<button id="ok" onclick="${okOnclick}">OK</button>
</div>
</div>
<div id="loading">
<div><span class="spinner">⏳</span>Sending emails — please wait…</div>
<div id="log"></div>
</div>
</body></html>`;
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
    .setHeight(420);
  SpreadsheetApp.getUi().showModalDialog(html, 'Choose Subject');
};

// ── Queue / bulk send ─────────────────────────────────────────────────────────

export const doSendTestEmail = (
  subject: string,
  topic = DEFAULT_TOPIC,
  runToken = '',
  sheet = SpreadsheetApp.getActiveSheet()
): void => {
  const scope = `send:${runToken}`;
  clearProgress(scope);
  const testRecipient = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.TEST_EMAIL);
  if (!testRecipient) {
    pushProgress(scope, 'TEST_EMAIL Script Property not set — aborting test send');
    Logger.log('TEST_EMAIL Script Property not set — aborting test send');
    return;
  }

  pushProgress(scope, `Starting test send: "${subject}"`);
  const emailTemplate = time(scope, 'Fetched draft template from Gmail', () => getGmailTemplateFromDrafts(subject));
  const data = time(scope, 'Read sheet data', () => sheet.getDataRange().getDisplayValues());
  const heads = data.shift() as string[];
  const rows = data.map(r =>
    heads.reduce<Record<string, string>>((o, k, i) => { o[k] = r[i] ?? ''; return o; }, {})
  );

  const row = rows[0];
  if (!row) {
    pushProgress(scope, 'No data rows found in sheet — aborting test send');
    Logger.log('No data rows found in sheet — aborting test send');
    return;
  }

  row[COLS.RECIPIENT] = testRecipient;
  const msgObj = fillInTemplateFromObject(emailTemplate.message, row, subject, scope);
  const linkedin = time(scope, `Sent to ${testRecipient}`, () => sendViaGmail(row, msgObj, emailTemplate, subject, topic, scope));
  // No follow-up reminder for test sends — the recipient is you.
  if (linkedin) handOffToExtension([linkedin]);
  pushProgress(scope, `Done — test email sent to ${testRecipient}`);
  log('INFO', 'Test email sent to %s', testRecipient);
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
  topic = DEFAULT_TOPIC,
  runToken = '',
  sheet = SpreadsheetApp.getActiveSheet()
): void => {
  const scope = `send:${runToken}`;
  clearProgress(scope);
  pushProgress(scope, `Starting send: "${subject}"`);
  log('DEBUG', 'Getting draft: %s', subject);
  const emailTemplate = time(scope, 'Fetched draft template from Gmail', () => getGmailTemplateFromDrafts(subject));
  const data = time(scope, 'Read sheet data', () => sheet.getDataRange().getDisplayValues());
  const heads = data.shift() as string[];
  const emailSentColIdx = heads.indexOf(COLS.EMAIL_SENT);

  const rows = data.map(r =>
    heads.reduce<Record<string, string>>((o, k, i) => { o[k] = r[i] ?? ''; return o; }, {})
  );

  // Preflight: one probe before the first send, so a downed server surfaces as a single clear
  // error instead of N rows of per-row failures. Throwing (rather than ui.alert) lets the subject
  // picker's withFailureHandler show it and re-display the form.
  const needsMetadata = rows.some(r => r[COLS.EMAIL_SENT] === '' && r[COLS.JOB_ID]);
  if (needsMetadata) {
    const unhealthy = time(scope, 'Checked metadata server', () => checkMetadataServer());
    if (unhealthy) throw new Error(`Aborted before sending — ${unhealthy}`);
  }

  const out: [string | Date][] = [];
  let sentCount = 0;
  const skipped: string[] = [];
  const linkedInContacts: LinkedInContact[] = [];
  const reminders: ReminderPayload[] = [];

  for (const [idx, row] of rows.entries()) {
    const label = `Row ${idx + 1}/${rows.length}`;
    if (row[COLS.EMAIL_SENT] === '') {
      pushProgress(scope, `${label}: ${row[COLS.RECIPIENT] || '(no recipient)'} — building email…`);
      try {
        const msgObj = fillInTemplateFromObject(emailTemplate.message, row, subject, scope);
        const linkedin = time(scope, `${label}: sent to ${row[COLS.RECIPIENT]}`, () =>
          sendViaGmail(row, msgObj, emailTemplate, subject, topic, scope)
        );
        if (linkedin) linkedInContacts.push(linkedin);
        // Queued only after sendViaGmail returns, so a throw above leaves no reminder for an
        // email that never went out. Dated from the actual send, not from when the row was added.
        reminders.push(buildFollowUpReminder(row, msgObj.subject));
        out.push([new Date()]);
        sentCount++;
        log('DEBUG', '%s: sent to %s', label, row[COLS.RECIPIENT]);
      } catch (e) {
        if (e instanceof UnresolvedTemplateError) {
          // Nothing was sent — leave the cell blank so the row is retried once the cause is fixed.
          skipped.push(`${row[COLS.RECIPIENT] || '(no recipient)'} — ${e.message}`);
          out.push(['']);
          pushProgress(scope, `${label}: skipped — ${e.message}`);
        } else {
          out.push([(e as Error).message]);
          pushProgress(scope, `${label}: failed — ${(e as Error).message}`);
        }
      }
    } else {
      out.push([row[COLS.EMAIL_SENT]]);
    }
  }

  sheet.getRange(2, emailSentColIdx + 1, out.length).setValues(out);

  if (skipped.length > 0) {
    log('WARN', 'Skipped %s row(s), left blank for retry:\n%s', skipped.length, skipped.join('\n'));
    pushProgress(scope, `Done — sent ${sentCount}, skipped ${skipped.length}`);
    SpreadsheetApp.getActive().toast(
      `Sent ${sentCount}, skipped ${skipped.length} — see logs`, '⚠️ Mail Merge Incomplete', 10
    );
  } else {
    pushProgress(scope, `Done — sent ${sentCount} email(s)`);
    SpreadsheetApp.getActive().toast(`Sent ${sentCount} email(s)`, '✅ Mail Merge Complete', 5);
  }

  // Show the bridge dialog if there is anything at all to hand off — reminders are created even
  // for recipients with no LinkedIn URL, so this can't be gated on linkedInContacts alone.
  if (linkedInContacts.length > 0 || reminders.length > 0) {
    handOffToExtension(linkedInContacts, reminders);
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

/** Scoped to drafts whose subject *contains* subjectLine (Gmail's own index does the filtering),
 *  so cost depends on matching drafts rather than every draft ever left in the mailbox. A thread
 *  can hold non-draft messages alongside the draft (e.g. a draft reply in an existing conversation),
 *  so isDraft() narrows to the actual draft message(s) before the exact-subject check below. */
const draftMessagesMatchingSubject = (subjectLine: string): TemplateMessage[] => {
  const escaped = subjectLine.replace(/"/g, '\\"');
  const threads = GmailApp.search(`in:drafts subject:"${escaped}"`);
  return threads.flatMap(t => t.getMessages()).filter(m => m.isDraft());
};

const getGmailTemplateFromDrafts = (subjectLine: string): {
  message: MsgObj;
  attachments: GoogleAppsScript.Base.Blob[];
} => {
  const candidates = draftMessagesMatchingSubject(subjectLine).map(msg => ({ getMessage: () => msg }));
  const matches = draftsMatchingSubject(candidates, subjectLine);
  if (matches.length === 0) throw new Error(`Oops - can't find Gmail draft: ${subjectLine}`);
  if (matches.length > 1) {
    // Expected once a run has left copies behind — worth logging so an unexpectedly high count
    // (or a pick with no tokens, below) is visible when drafts go stale.
    Logger.log('Found %s drafts with subject "%s" — using the template', matches.length, subjectLine);
  }

  const draft = selectTemplateDraft(matches, subjectLine);
  if (!draft) throw new Error(`Oops - can't find Gmail draft: ${subjectLine}`);
  const msg = draft.getMessage();
  if (matches.length > 1 && !hasUnresolvedTokens(msg)) {
    log('WARN', 'No draft with subject "%s" still has {{tokens}} — is the original template deleted?', subjectLine);
  }
  return {
    message: { subject: subjectLine, text: msg.getPlainBody(), html: msg.getBody() },
    attachments: msg.getAttachments({ includeInlineImages: false }) as unknown as GoogleAppsScript.Base.Blob[],
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

export const fillInTemplateFromObject = (
  template: MsgObj, data: Record<string, string>, subjectLine?: string, scope?: string
): MsgObj => {
  let s = JSON.stringify(template);

  // Stage 0: Fetch job metadata first so {{Blurb}} and {{Intro}} can use it below
  const jobId = data[COLS.JOB_ID];
  log('INFO', 'Stage 0: jobId=%s', jobId || '(empty — check JobID column in sheet)');
  if (jobId) {
    const meta = getJobMetadata(jobId, scope);
    log('INFO', 'Stage 0: metadata %s', meta ? `found (company=${meta.Company})` : 'null — aborting row');
    // Fail closed: without metadata, {{Company}}/{{JobTitle*}}/{{Intro}} would silently render blank.
    if (!meta) {
      throw new UnresolvedTemplateError(
        `Job metadata unavailable for JobID ${jobId} — is unified-server running?`
      );
    }
    data['Company'] = meta.Company;
    data['JobTitleActual'] = meta.jobTitle;
    data['JobTitleShorthand'] = meta.jobTitleShorthand;
    data['JobURL'] = meta.jobURL;
    if (meta.thirdPersonBlurb) data['Blurb'] = meta.thirdPersonBlurb;
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
    '{{CalendlyURL}}': calendlyURL(),
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
    '{{Company}}': data[COLS.COMPANY] || '',
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

  // Stage 2: Generic {{key}} replacement from row data.
  // Collect tokens that resolve to nothing — a post-hoc scan for leftover {{...}} can't catch
  // these, since substitution has already erased them.
  const missing: string[] = [];
  s = s.replace(/{{[^{}]+}}/g, token => {
    const key = token.replace(/[{}]+/g, '');
    const value = data[key] ?? '';
    if (!value && !OPTIONAL_TOKENS.has(key)) missing.push(key);
    return escapeData(value);
  });

  if (missing.length > 0) {
    throw new UnresolvedTemplateError(
      `Unresolved template token(s): ${[...new Set(missing)].join(', ')}`
    );
  }

  return JSON.parse(s) as MsgObj;
};

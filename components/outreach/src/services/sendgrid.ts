// SendGrid email sending.
// API key must be set via GAS Script Properties: SENDGRID_API_KEY
// (Never hardcode — the old key from Code.gs has been revoked.)

import { COLS, SCRIPT_PROPS, requireProp } from '../config/settings';

interface MsgObj {
  subject: string;
  html: string;
}

export function sendEmailWithSendGrid(
  row: Record<string, string>,
  msgObj: MsgObj
): void {
  const apiKey = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.SENDGRID_API_KEY);
  if (!apiKey) {
    Logger.log('SENDGRID_API_KEY not set in Script Properties');
    return;
  }

  const payload = {
    personalizations: [{ to: [{ email: row[COLS.RECIPIENT] }] }],
    from: { email: requireProp(SCRIPT_PROPS.MY_EMAIL) },
    subject: msgObj.subject,
    content: [{ type: 'text/html', value: msgObj.html }],
  };

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${apiKey}` },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch('https://api.sendgrid.com/v3/mail/send', options);
    Logger.log('Status Code: %s', response.getResponseCode());
    if (response.getResponseCode() === 202) {
      Logger.log('Email sent successfully!');
    } else {
      Logger.log('SendGrid error: %s', response.getContentText());
    }
  } catch (e) {
    Logger.log('Error sending via SendGrid: %s', e);
  }
}

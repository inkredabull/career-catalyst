// SendGrid email sending with open/click tracking.
// API key must be set via GAS Script Properties: SENDGRID_API_KEY

import { SCRIPT_PROPS, requireProp } from '../config/settings';

export const sendEmailWithSendGrid = (
  to: string,
  msgObj: { subject: string; html: string; text: string },
  opts: { attachments?: GoogleAppsScript.Base.Blob[] } = {}
): void => {
  const apiKey = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.SENDGRID_API_KEY);
  if (!apiKey) throw new Error('SENDGRID_API_KEY Script Property not set');

  const attachments = (opts.attachments ?? []).map(blob => ({
    content: Utilities.base64Encode(blob.getBytes()),
    filename: blob.getName() ?? 'attachment',
    type: blob.getContentType() ?? 'application/octet-stream',
    disposition: 'attachment',
  }));

  const payload: Record<string, unknown> = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: requireProp(SCRIPT_PROPS.MY_EMAIL) },
    subject: msgObj.subject,
    content: [
      { type: 'text/plain', value: msgObj.text || ' ' },
      { type: 'text/html', value: msgObj.html },
    ],
    tracking_settings: {
      click_tracking: { enable: true },
      open_tracking: { enable: true },
    },
  };

  if (attachments.length > 0) payload.attachments = attachments;

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${apiKey}` },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch('https://api.sendgrid.com/v3/mail/send', options);
  const code = response.getResponseCode();
  if (code !== 202) {
    throw new Error(`SendGrid error ${code}: ${response.getContentText()}`);
  }
};

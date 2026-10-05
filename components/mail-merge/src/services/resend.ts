// Resend email sending with open/click tracking (enabled by default).
// API key must be set via GAS Script Properties: RESEND_API_KEY

import { SCRIPT_PROPS, requireProp } from '../config/settings';

export const sendEmailWithResend = (
  to: string,
  msgObj: { subject: string; html: string; text: string },
  opts: { attachments?: GoogleAppsScript.Base.Blob[] } = {}
): void => {
  const apiKey = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.RESEND_API_KEY);
  if (!apiKey) throw new Error('RESEND_API_KEY Script Property not set');

  const attachments = (opts.attachments ?? []).map(blob => ({
    filename: blob.getName() ?? 'attachment',
    content: Utilities.base64Encode(blob.getBytes()),
  }));

  const payload: Record<string, unknown> = {
    from: requireProp(SCRIPT_PROPS.MY_EMAIL),
    to: [to],
    subject: msgObj.subject,
    html: msgObj.html,
    text: msgObj.text || ' ',
  };

  if (attachments.length > 0) payload.attachments = attachments;

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${apiKey}` },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch('https://api.resend.com/emails', options);
  const code = response.getResponseCode();
  if (code !== 200) {
    throw new Error(`Resend error ${code}: ${response.getContentText()}`);
  }
};

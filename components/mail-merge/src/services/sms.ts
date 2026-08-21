// SMS sending via ngrok tunnel, to POST /send on components/unified-server.
// NGROK_TUNNEL_URL and SMS_BRIDGE_SECRET are bundled at build time from the
// repo root (.env and .sms-bridge-secret) — no Script Properties needed.
// Rotating the secret therefore requires a rebuild and redeploy of this bundle.

import { NGROK_TUNNEL_URL, SMS_BRIDGE_SECRET } from '../config/env';

export const normalizePhoneNumber = (input: string): string => {
  let digits = String(input).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) throw new Error(`Invalid phone number: ${input}`);
  return `+1${digits}`;
};

export const sendRealSms = (to: string, message: string): void => {
  if (!NGROK_TUNNEL_URL) {
    Logger.log('NGROK_TUNNEL_URL not set in .env — rebuild required');
    return;
  }
  if (!SMS_BRIDGE_SECRET) {
    Logger.log('SMS_BRIDGE_SECRET not bundled — create .sms-bridge-secret and rebuild');
    return;
  }
  const url = `${NGROK_TUNNEL_URL}/send`;
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-SMS-Bridge-Token': SMS_BRIDGE_SECRET },
    payload: JSON.stringify({ to, message }),
    followRedirects: true,
    muteHttpExceptions: true,
  });
  Logger.log('SMS response %s: %s', res.getResponseCode(), res.getContentText());
};

export const buildSmsMessage = (first: string, email: string, topic = 'making a connection'): string =>
  [
    `Hi ${first}, is ${email} the best to reach you at? Just emailed you about ${topic}. Hope you've been well!`,
    // '- Anthony Bull',
  ].join('\n\n');

export const notifyViaSMS = (first: string, email: string, number: string, topic = 'making a connection'): void => {
  sendRealSms(normalizePhoneNumber(number), buildSmsMessage(first, email, topic));
};

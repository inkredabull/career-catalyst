// SMS sending via ngrok tunnel.
// Set NGROK_SMS_URL in Script Properties (changes each session).

import { SCRIPT_PROPS } from '../config/settings';

export const normalizePhoneNumber = (input: string): string => {
  let digits = String(input).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) throw new Error(`Invalid phone number: ${input}`);
  return `+1${digits}`;
};

export const sendRealSms = (to: string, message: string): void => {
  const ngrokUrl = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.NGROK_SMS_URL);
  if (!ngrokUrl) {
    Logger.log('NGROK_SMS_URL not set in Script Properties');
    return;
  }
  const url = `${ngrokUrl}/send`;
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
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

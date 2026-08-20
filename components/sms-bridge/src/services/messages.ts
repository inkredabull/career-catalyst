import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

/** How long osascript gets before we give up on it. */
const OSASCRIPT_TIMEOUT_MS = 60_000;

/** Which Messages.app service actually delivered a message. */
export type DeliveryService = 'IMESSAGE' | 'SMS' | 'UNKNOWN';

/**
 * Coerce a recipient into something Messages.app will accept as a buddy handle.
 *
 * Deliberately lenient — it passes through anything it can't confidently
 * normalize and lets Messages.app reject it. This differs from
 * components/mail-merge/src/services/sms.ts `normalizePhoneNumber`, which
 * throws on anything that isn't a 10-digit US number. That component only ever
 * sends to known-good sheet data; the bridge is a general endpoint and also
 * has to handle email handles for iMessage.
 */
export function normalizeToHandle(toRaw: unknown): string {
  const s = String(toRaw ?? '').trim();
  if (!s) return s;

  // email → iMessage only
  if (s.includes('@')) return s;

  // already E.164-ish
  if (s.startsWith('+')) return '+' + s.slice(1).replace(/[^\d]/g, '');

  // strip punctuation
  const digits = s.replace(/[^\d]/g, '');

  // assume US if 10 digits
  if (digits.length === 10) return `+1${digits}`;

  // 11 digits starting with 1
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;

  // fallback
  return s;
}

/**
 * AppleScript that tries iMessage first and falls back to the SMS service.
 *
 * Returns the service name on stdout so the caller can log which path won.
 * The handle and message are passed as argv rather than interpolated, so no
 * escaping of quotes or newlines in the message body is required.
 */
export function buildAppleScript(): string {
  return `
on run argv
  set theHandle to item 1 of argv
  set theMsg to item 2 of argv

  tell application "Messages"
    try
      set imService to 1st service whose service type is iMessage
      set imBuddy to buddy theHandle of imService
      send theMsg to imBuddy
      return "IMESSAGE"
    on error errMsg number errNum
      try
        set smsService to 1st service whose service type is SMS
        set smsBuddy to buddy theHandle of smsService
        send theMsg to smsBuddy
        return "SMS"
      on error errMsg2 number errNum2
        error "BOTH_FAILED: " & errNum & " " & errMsg & " | " & errNum2 & " " & errMsg2
      end try
    end try
  end tell
end run
`.trim();
}

function writeTempAppleScript(contents: string): string {
  const id = crypto.randomBytes(8).toString('hex');
  const filePath = path.join(os.tmpdir(), `sms-bridge-${id}.applescript`);
  fs.writeFileSync(filePath, contents, 'utf8');
  return filePath;
}

export interface SendResult {
  service: DeliveryService;
  elapsedMs: number;
}

/**
 * Send a message via Messages.app. Rejects if osascript fails or times out.
 *
 * Callers are expected to have already responded to the HTTP request — see
 * the note in routes/send.ts.
 */
export function sendViaMessages(handle: string, message: string): Promise<SendResult> {
  const scriptPath = writeTempAppleScript(buildAppleScript());
  const start = Date.now();

  return new Promise<SendResult>((resolve, reject) => {
    execFile(
      'osascript',
      [scriptPath, handle, message],
      { timeout: OSASCRIPT_TIMEOUT_MS },
      (err, stdout, stderr) => {
        const elapsedMs = Date.now() - start;

        try {
          fs.unlinkSync(scriptPath);
        } catch {
          // best-effort cleanup; a leftover temp file is not worth failing over
        }

        if (err) {
          if (stderr) console.error('stderr:', stderr);
          reject(err);
          return;
        }

        if (stderr) console.log('stderr:', stderr);
        const service = ((stdout || '').trim() || 'UNKNOWN') as DeliveryService;
        resolve({ service, elapsedMs });
      }
    );
  });
}

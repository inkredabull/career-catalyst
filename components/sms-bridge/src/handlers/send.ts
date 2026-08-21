import crypto from 'crypto';
import type { RequestHandler } from 'express';

import { normalizeToHandle, sendViaMessages } from '../services/messages';

/**
 * `POST /send` — `{ to, message }` → Messages.app.
 *
 * Mounted by components/unified-server. Exported as a bare handler rather than
 * an express Router so it stays independent of the host app's express major
 * version; express appears here only as a type-only import.
 *
 * Responds 202 *immediately* and does the AppleScript work afterwards. This is
 * deliberate and load-bearing: osascript against Messages.app routinely takes
 * seconds, and the caller reaches this route through ngrok from Google Apps
 * Script, whose UrlFetch will time out and retry if we hold the connection
 * open. Do not turn this into an awaited handler — failures are reported via
 * logs, not the response.
 */
export const handleSend: RequestHandler = (req, res) => {
  const { to, message } = req.body || {};
  const requestId = crypto.randomBytes(6).toString('hex');

  console.log(`→ [${requestId}] Incoming send request:`, { to, message });

  // Respond before doing any work so ngrok / Apps Script never time out.
  res.status(202).send('accepted');

  if (!to || !message) {
    console.error(`✗ [${requestId}] Missing 'to' or 'message'`);
    return;
  }

  const handle = normalizeToHandle(to);

  void sendViaMessages(handle, String(message))
    .then(({ service, elapsedMs }) => {
      console.log(`✓ [${requestId}] Sent via ${service} in ${elapsedMs}ms → ${handle}`);
    })
    .catch((err: Error) => {
      console.error(`✗ [${requestId}] osascript failed:`, err.message);
    });
};

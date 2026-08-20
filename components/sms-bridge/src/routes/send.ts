import crypto from 'crypto';
import { Router } from 'express';

import { normalizeToHandle, sendViaMessages } from '../services/messages';

export const sendRouter: Router = Router();

/**
 * POST /send  { to, message }
 *
 * Responds 202 *immediately* and does the AppleScript work afterwards. This is
 * deliberate and load-bearing: osascript against Messages.app routinely takes
 * seconds, and both callers (ngrok → Google Apps Script UrlFetch) will time out
 * and retry if we hold the connection open. Do not turn this into an awaited
 * handler — errors are reported via logs, not the response.
 */
sendRouter.post('/send', (req, res) => {
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
});

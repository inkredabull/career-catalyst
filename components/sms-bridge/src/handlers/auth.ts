import crypto from 'crypto';
import type { RequestHandler } from 'express';

import { loadSendSecret, SECRET_FILENAME } from '../config/secret';

/** Header callers must present on POST /send. */
export const SEND_TOKEN_HEADER = 'x-sms-bridge-token';

/** Constant-time compare that doesn't leak length via early return. */
export function tokensMatch(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    // Still burn a comparison so the timing profile doesn't depend on length.
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

/**
 * Guard for POST /send.
 *
 * Fails closed: with no secret configured the route is unavailable rather
 * than open. /send can send texts from the operator's personal phone number
 * and is reachable from the public internet whenever the ngrok tunnel is up,
 * so an unconfigured deployment must not be a silently unauthenticated one.
 */
export const requireSendAuth: RequestHandler = (req, res, next) => {
  const expected = loadSendSecret();

  if (!expected) {
    console.error(
      `✗ /send rejected: no shared secret configured. Create ${SECRET_FILENAME} ` +
        `at the repo root (see ${SECRET_FILENAME}.example) or set SMS_BRIDGE_SECRET.`
    );
    res.status(503).json({ error: 'send endpoint is not configured' });
    return;
  }

  const presented = req.get(SEND_TOKEN_HEADER);

  if (!presented || !tokensMatch(presented, expected)) {
    console.error(
      `✗ /send rejected: ${presented ? 'bad' : 'missing'} ${SEND_TOKEN_HEADER} header`
    );
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  next();
};

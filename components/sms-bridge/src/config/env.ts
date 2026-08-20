/**
 * Configuration for the SMS bridge.
 *
 * Unlike components/alerts, nothing here uses a `requireEnv` throw: the bridge
 * must boot with zero configuration so `npm run sms-bridge` works on a fresh
 * clone. Every value has a working local default.
 */

export const ENV = Object.freeze({
  SMS_BRIDGE_PORT: 'SMS_BRIDGE_PORT',
  UNIFIED_SERVER_URL: 'UNIFIED_SERVER_URL',
} as const);

/**
 * Port the bridge listens on.
 *
 * The 3334 default is load-bearing: components/alerts/src/notify.ts falls back
 * to `http://localhost:3334` when NGROK_TUNNEL_URL is unset. Changing this
 * default means changing that fallback too.
 */
export const PORT: number = Number(process.env[ENV.SMS_BRIDGE_PORT]) || 3334;

/**
 * Base URL of components/unified-server, which this bridge reverse-proxies so
 * a single ngrok tunnel can serve both.
 */
export const UNIFIED_SERVER_URL: string =
  process.env[ENV.UNIFIED_SERVER_URL] ?? 'http://localhost:3000';

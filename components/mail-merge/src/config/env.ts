// Values bundled at build time from the repo root .env via webpack DefinePlugin.
declare const __NGROK_TUNNEL_URL__: string;
export const NGROK_TUNNEL_URL: string = __NGROK_TUNNEL_URL__;

// Shared secret for POST /send, from the gitignored root .sms-bridge-secret.
declare const __SMS_BRIDGE_SECRET__: string;
export const SMS_BRIDGE_SECRET: string = __SMS_BRIDGE_SECRET__;

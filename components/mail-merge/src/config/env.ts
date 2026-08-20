// Values bundled at build time from the repo root .env via webpack DefinePlugin.
declare const __NGROK_TUNNEL_URL__: string;
export const NGROK_TUNNEL_URL: string = __NGROK_TUNNEL_URL__;

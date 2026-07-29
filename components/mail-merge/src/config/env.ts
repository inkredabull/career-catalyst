// Values bundled at build time from .env via webpack DefinePlugin.
// .env is gitignored — copy .env.example and fill in real values.
declare const __NGROK_SMS_URL__: string;
export const NGROK_SMS_URL: string = __NGROK_SMS_URL__;

// Script Properties keys — set via File > Project properties > Script properties in GAS
export const SCRIPT_PROPS = {
  ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY',
  OPENAI_API_KEY: 'OPENAI_API_KEY',
  SENDGRID_API_KEY: 'SENDGRID_API_KEY',
  MY_EMAIL: 'MY_EMAIL',
  TEST_EMAIL: 'TEST_EMAIL',
  MY_PHONE: 'MY_PHONE',
  CALENDLY_URL: 'CALENDLY_URL',
  NGROK_SMS_URL: 'NGROK_SMS_URL',
} as const;

/** Read a required Script Property — throws with a clear message if not set. */
export function requireProp(key: string): string {
  const val = PropertiesService.getScriptProperties().getProperty(key);
  if (!val) throw new Error(`Script Property not set: ${key}`);
  return val;
}

// Column name constants — must match spreadsheet header row
export const COLS = {
  RECIPIENT: 'Recipient',
  CELL: 'Cell',
  FIRST_NAME: 'First',
  EMAIL_SENT: 'Email Sent',
  SUBJECT: 'Subject',
  JOB_ID: 'JobID',
} as const;

// Sheet names — update to match your spreadsheet
export const SHEETS = {
  CONTACTS: 'Contacts',
  OUTREACH: 'Outreach',
  DATA: 'Data',
} as const;

// Feature flags
export const FLAGS = {
  SEND_SMS: false,
  ATTACH_RESUME: false,
} as const;

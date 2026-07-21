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
  PHOTO_URL: 'PHOTO_URL',
  RESUME_URL: 'RESUME_URL',
  WARMUP_EXCLUDE_LABEL_PREFIXES: 'WARMUP_EXCLUDE_LABEL_PREFIXES',
  WARMUP_EXCLUDE_EMAILS: 'WARMUP_EXCLUDE_EMAILS',
} as const;

/** Read a required Script Property — throws with a clear message if not set. */
export const requireProp = (key: string): string => {
  const val = PropertiesService.getScriptProperties().getProperty(key);
  if (!val) throw new Error(`Script Property not set: ${key}`);
  return val;
};

// Column name constants — must match spreadsheet header row
export const COLS = {
  RECIPIENT: 'Recipient',
  CELL: 'Cell',
  FIRST_NAME: 'First',
  FULL_NAME: 'Full Name',
  EMAIL_SENT: 'Email Sent',
  SUBJECT: 'Subject',
  JOB_ID: 'JobID',
  LINKEDIN: 'LinkedIn',
} as const;

// Sheet names — update to match your spreadsheet
export const SHEETS = {
  CONTACTS: 'Contacts',
  OUTREACH: 'Outreach',
  DATA: 'Data',
  SUBJECT_LINES: 'Subject Lines : Raw',
} as const;

// Feature flags - can be overridden per subject line
export const FLAGS = {
  SEND_SMS: false,
  ATTACH_RESUME: false,
  ATTACH_PHOTO: false,
};

// Subject lines with their flag overrides and default SMS/LinkedIn topic, in picker display order
export const SUBJECT_LINE_CONFIG = [
  {
    subject: 'Get your help for role as {{JobTitleShorthand}} at {{Company}}?',
    defaultTopic: 'a role I could use your help to land',
    flags: { SEND_SMS: true, ATTACH_RESUME: true, ATTACH_PHOTO: true },
  },
  // {
  //   subject: 'Need some fractional ENG help?',
  //   defaultTopic: 'fractional ENG help',
  //   flags: { SEND_SMS: false, ATTACH_RESUME: false, ATTACH_PHOTO: false },
  // },
  // { subject: 'Q2 2026 latest-and-greatest', defaultTopic: 'the latest', flags: { SEND_SMS: true, ATTACH_RESUME: false, ATTACH_PHOTO: true } },
  {
    subject: "Need any add'l eng firepower?",
    defaultTopic: 'adding eng firepower',
    flags: { SEND_SMS: true, ATTACH_RESUME: false, ATTACH_PHOTO: true },
  },
  {
    subject: "Quick Favor - Exploring What's Next",
    defaultTopic: "exploring what's next for me",
    flags: { SEND_SMS: true, ATTACH_RESUME: false, ATTACH_PHOTO: true },
  },
  {
    subject: "Catching up + a quick ask",
    defaultTopic: 'quick ask about opportunities',
    flags: { SEND_SMS: true, ATTACH_RESUME: false, ATTACH_PHOTO: true },
  },
] as const;

export const SUBJECT_LINES = SUBJECT_LINE_CONFIG.map(c => c.subject);

export const getFlagsForSubject = (subjectLine: string): typeof FLAGS => {
  const entry = SUBJECT_LINE_CONFIG.find(c => c.subject === subjectLine);
  return entry ? { ...FLAGS, ...entry.flags } : FLAGS;
};

export const getTopicForSubject = (subjectLine: string): string =>
  SUBJECT_LINE_CONFIG.find(c => c.subject === subjectLine)?.defaultTopic ?? 'making a connection';

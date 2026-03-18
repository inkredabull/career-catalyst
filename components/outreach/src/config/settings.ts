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

// Column names in the Subject Lines sheet
export const SUBJECT_LINE_COLS = {
  SUBJECT: 'Subject Line',
  SHOW: 'Show',
} as const;

// Feature flags - can be overridden per subject line
export const FLAGS = {
  SEND_SMS: false,
  ATTACH_RESUME: false,
} as const;

// Per-subject-line flag overrides
// Keys can be exact subject matches or regex patterns
export const SUBJECT_LINE_FLAGS: Record<string, Partial<typeof FLAGS>> = {
  // Examples:
  // 'Exact Subject Match': { SEND_SMS: true, ATTACH_RESUME: true },
  // '/.*Application.*/': { SEND_SMS: false },
  // '/.*Interview.*/': { ATTACH_RESUME: true },
} as const;

// Helper function to get flags for a specific subject line
export const getFlagsForSubject = (subjectLine: string): typeof FLAGS => {
  // Check for exact matches first
  if (SUBJECT_LINE_FLAGS[subjectLine]) {
    return { ...FLAGS, ...SUBJECT_LINE_FLAGS[subjectLine] };
  }

  // Check for regex pattern matches
  for (const [pattern, overrides] of Object.entries(SUBJECT_LINE_FLAGS)) {
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      const regex = new RegExp(pattern.slice(1, -1));
      if (regex.test(subjectLine)) {
        return { ...FLAGS, ...overrides };
      }
    }
  }

  // Return default flags if no matches found
  return FLAGS;
};

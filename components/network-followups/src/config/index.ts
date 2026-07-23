/**
 * Configuration - Column indices, status enums, and constants
 *
 * @module config
 */

/** Name of the Google Sheet tab */
export const SHEET_NAME = 'Contacts';

/** Column indices (0-based) matching the 12-column schema */
export const COL = {
  NAME: 0,              // A
  LINKEDIN_URL: 1,      // B
  ORIGINAL_MESSAGE: 2,  // C
  DATE_SENT: 3,         // D
  STATUS: 4,            // E
  WITHDRAWN_DATE: 5,    // F
  ATTEMPTS_USED: 6,     // G
  LAST_ATTEMPT_DATE: 7, // H
  NEXT_ELIGIBLE_DATE: 8,// I
  VARIANT_1: 9,         // J
  VARIANT_2: 10,        // K
  NOTES: 11,            // L
} as const;

/** Total number of columns in the sheet */
export const NUM_COLS = 12;

/** Row number of the header row (1-indexed) */
export const HEADER_ROW = 1;

/** First data row (1-indexed) */
export const DATA_START_ROW = 2;

/** Status lifecycle for a contact */
export const STATUS = {
  INVITED: 'INVITED',
  PENDING_WITHDRAWAL: 'PENDING_WITHDRAWAL',
  WITHDRAWN: 'WITHDRAWN',
  REINVITED_1: 'REINVITED_1',
  REINVITED_2: 'REINVITED_2',
  COMPLETE: 'COMPLETE',
} as const;

export type ContactStatus = (typeof STATUS)[keyof typeof STATUS];

/** Day thresholds for workflow logic */
export const DAYS = {
  /** Withdraw invitations older than this many days */
  WITHDRAWAL_THRESHOLD: 30,
  /** LinkedIn blocks re-inviting for this many days after withdrawal */
  LINKEDIN_COOLDOWN: 21,
} as const;

/** Maximum number of re-invite attempts after initial withdrawal */
export const MAX_ATTEMPTS = 2;

/** Claude model to use for variant generation */
export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

/** Column header labels (order must match COL indices) */
export const HEADERS = [
  'Name',
  'LinkedIn URL',
  'Original Message',
  'Date Sent',
  'Status',
  'Withdrawn Date',
  'Attempts Used',
  'Last Attempt Date',
  'Next Eligible Date',
  'Variant 1 Message',
  'Variant 2 Message',
  'Notes',
];

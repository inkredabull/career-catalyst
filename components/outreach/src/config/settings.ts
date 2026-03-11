// Script Properties keys — set via File > Project properties > Script properties in GAS
export const SCRIPT_PROPS = {
  ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY',
  OPENAI_API_KEY: 'OPENAI_API_KEY',
} as const;

// Sheet names — update to match your spreadsheet
export const SHEETS = {
  CONTACTS: 'Contacts',
  OUTREACH: 'Outreach',
} as const;

/** Environment variable keys */
export const ENV = {
  MY_EMAIL:            'MY_EMAIL',
  LI_COOKIE:           'LI_COOKIE',
  LI_CSRF_TOKEN:       'LI_CSRF_TOKEN',
  STOP_LIST_COMPANIES: 'STOP_LIST_COMPANIES',
  STOP_LIST_TITLES:    'STOP_LIST_TITLES',
  SEARCH_TIME_FRAME:   'SEARCH_TIME_FRAME',
  SERPER_API_KEY:      'SERPER_API_KEY',
  ANTHROPIC_API_KEY:   'ANTHROPIC_API_KEY',
  RESEND_API_KEY:      'RESEND_API_KEY',
  LOG_LEVEL:           'LOG_LEVEL',
} as const;

/** Read a required env var — throws with a clear message if not set. */
export function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Environment variable not set: ${key}`);
  return val;
}

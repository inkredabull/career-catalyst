/** Script Property keys — set via GAS editor: Project Settings → Script Properties */
export const SCRIPT_PROPS = {
  MY_EMAIL:            'MY_EMAIL',
  LI_COOKIE:           'LI_COOKIE',
  LI_CSRF_TOKEN:       'LI_CSRF_TOKEN',
  WEB_APP_URL:         'WEB_APP_URL',         // set after deploying as web app
  STOP_LIST_COMPANIES: 'STOP_LIST_COMPANIES', // JSON array of company name strings
  STOP_LIST_TITLES:    'STOP_LIST_TITLES',    // JSON array of title strings
  SEARCH_TIME_FRAME:   'SEARCH_TIME_FRAME',   // LinkedIn time filter: r28800 (8h), r86400 (24h), r604800 (7d)
  GOOGLE_API_KEY:      'GOOGLE_API_KEY',      // Google Cloud API key with Custom Search API enabled
  GOOGLE_CSE_ID:       'GOOGLE_CSE_ID',       // Custom Search Engine ID (cx)
} as const;

/** Read a required Script Property — throws with a clear message if not set. */
export const requireProp = (key: string): string => {
  const val = PropertiesService.getScriptProperties().getProperty(key);
  if (!val) throw new Error(`Script Property not set: ${key}`);
  return val;
};

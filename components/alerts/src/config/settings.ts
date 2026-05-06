/** Script Property keys — set via GAS editor: Project Settings → Script Properties */
export const SCRIPT_PROPS = {
  MY_EMAIL:       'MY_EMAIL',
  LI_COOKIE:      'LI_COOKIE',
  LI_CSRF_TOKEN:  'LI_CSRF_TOKEN',
} as const;

/** Read a required Script Property — throws with a clear message if not set. */
export const requireProp = (key: string): string => {
  const val = PropertiesService.getScriptProperties().getProperty(key);
  if (!val) throw new Error(`Script Property not set: ${key}`);
  return val;
};

import { SCRIPT_PROPS } from './config/settings';

function readList(key: string): string[] {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(key);
    return raw ? JSON.parse(raw) as string[] : [];
  } catch { return []; }
}

export function doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.HTML.HtmlOutput {
  const type  = e.parameter['type'];
  const value = e.parameter['value'];

  if (!type || !value) {
    return HtmlService.createHtmlOutput('<p>Missing parameters.</p>');
  }

  const key  = type === 'company' ? SCRIPT_PROPS.STOP_LIST_COMPANIES : SCRIPT_PROPS.STOP_LIST_TITLES;
  const list = readList(key);

  if (!list.some(s => s.toLowerCase() === value.toLowerCase())) {
    list.push(value);
    PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(list));
  }

  return HtmlService.createHtmlOutput(
    `<h2>✅ Blocked</h2><p><strong>${value}</strong> added to ${type} stop list.</p>`
  );
}

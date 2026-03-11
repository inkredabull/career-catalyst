// GAS entry point — all functions assigned to global scope are callable from the sheet.
import { onOpen } from './ui/menu';
import { SCRIPT_PROPS } from './config/settings';
import { PROFILE } from './config/profile';
import { generateOutreachMessage, OutreachContext } from './services/message-generator';

// Custom sheet functions — callable from cells as =resumeURL(), =blurb()
function resumeURL(): string {
  return PROFILE.resumeURL;
}

function blurb(): readonly string[] {
  return PROFILE.blurb;
}

function generateMessageForRow(): void {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const row = sheet.getActiveRange()?.getRow() ?? 2;

  const ctx: OutreachContext = {
    contactName: sheet.getRange(row, 1).getValue() as string,
    contactRole: sheet.getRange(row, 2).getValue() as string,
    company: sheet.getRange(row, 3).getValue() as string,
    jobTitle: sheet.getRange(row, 4).getValue() as string,
    notes: sheet.getRange(row, 5).getValue() as string,
  };

  const apiKey = PropertiesService.getScriptProperties().getProperty(
    SCRIPT_PROPS.ANTHROPIC_API_KEY
  );
  if (!apiKey) {
    SpreadsheetApp.getUi().alert('ANTHROPIC_API_KEY not set in Script Properties.');
    return;
  }

  const message = generateOutreachMessage(ctx, apiKey, UrlFetchApp.fetch.bind(UrlFetchApp));
  sheet.getRange(row, 6).setValue(message.subject);
  sheet.getRange(row, 7).setValue(message.body);
}

// Expose to GAS global scope
const g = global as unknown as Record<string, unknown>;
g['onOpen'] = onOpen;
g['resumeURL'] = resumeURL;
g['blurb'] = blurb;
g['generateMessageForRow'] = generateMessageForRow;

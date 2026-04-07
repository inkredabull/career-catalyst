import { execSync } from 'child_process';
import { LinkedInProfile } from './profileLookup.js';

function generateClickMessageScript(message: string): string {
  const escaped = message
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');

  return [
    '(function() {',
    '  var allButtons = Array.from(document.querySelectorAll("button"));',
    '  var msgBtn = allButtons.find(function(b) {',
    '    var label = b.getAttribute("aria-label") || "";',
    '    return label.toLowerCase().startsWith("message ");',
    '  });',
    '  if (!msgBtn) { console.log("Message button not found"); return; }',
    '  msgBtn.click();',
    '  console.log("Clicked Message button");',
    '  setTimeout(function() {',
    '    var box = document.querySelector(".msg-form__contenteditable[contenteditable=\\"true\\"]")',
    '           || document.querySelector("div[role=\\"textbox\\"][contenteditable=\\"true\\"]");',
    '    if (!box) { console.log("Compose box not found"); return; }',
    '    box.focus();',
    `    document.execCommand("selectAll", false, null);`,
    `    document.execCommand("insertText", false, "${escaped}");`,
    '    console.log("Message filled");',
    '  }, 1500);',
    '})();',
  ].join('');
}

function injectJavaScriptIntoChrome(tabIndex: number, javascript: string): void {
  const escapedJs = javascript
    .trim()
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

  const appleScript = `tell application "Google Chrome"
  tell tab ${tabIndex} of front window
    execute javascript "${escapedJs}"
  end tell
end tell`;

  try {
    execSync('osascript', { input: appleScript, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    console.log(`  ⚠️  Error injecting into tab ${tabIndex}`);
  }
}

export async function openMessageModal(
  profile: LinkedInProfile,
  tabIndex: number,
  eventName: string
): Promise<void> {
  const firstName = profile.firstName || profile.name.split(' ')[0];
  const summary = profile.condensedSummary || profile.domain || 'your industry';
  const messageTemplate = process.env.LINKEDIN_MESSAGE_TEMPLATE ||
    'Hi {{firstName}}, looking forward to connecting!';
  const message = messageTemplate
    .replace(/\{\{firstName\}\}/g, firstName)
    .replace(/\{\{summary\}\}/g, summary)
    .replace(/\{\{event\}\}/g, eventName);

  console.log(`  Opening message modal for ${profile.name} (tab ${tabIndex})...`);
  injectJavaScriptIntoChrome(tabIndex, generateClickMessageScript(message));
}

import { execSync } from 'child_process';
import { LinkedInProfile } from './profileLookup.js';

function generateConnectScript(message: string): string {
  const escaped = message
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');

  return [
    '(function() {',
    '  function fillTextarea() {',
    '    var ta = document.querySelector("textarea");',
    '    if (!ta) { console.log("Textarea not found"); return; }',
    `    ta.value = "${escaped}";`,
    '    ta.dispatchEvent(new Event("input", { bubbles: true }));',
    '    ta.dispatchEvent(new Event("change", { bubbles: true }));',
    '    console.log("Note filled");',
    '  }',
    '  function clickAddNote() {',
    '    var btns = Array.from(document.querySelectorAll("button"));',
    '    var addNote = btns.find(function(b) {',
    '      return (b.innerText || "").toLowerCase().includes("add a note");',
    '    });',
    '    if (addNote) { addNote.click(); setTimeout(fillTextarea, 800); }',
    '    else { fillTextarea(); }',
    '  }',
    '  var btns = Array.from(document.querySelectorAll("button"));',
    '  var connectBtn = btns.find(function(b) {',
    '    var label = (b.getAttribute("aria-label") || b.innerText || "").toLowerCase();',
    '    return label.startsWith("invite ") || label === "connect";',
    '  });',
    '  if (!connectBtn) {',
    '    var moreBtn = btns.find(function(b) {',
    '      var t = (b.innerText || "").toLowerCase().trim();',
    '      var l = (b.getAttribute("aria-label") || "").toLowerCase();',
    '      return t === "more" || l.includes("more");',
    '    });',
    '    if (moreBtn) {',
    '      moreBtn.click();',
    '      setTimeout(function() {',
    '        var elems = Array.from(document.querySelectorAll("button, div[role=\\"menuitem\\"]"));',
    '        var conn = elems.find(function(e) {',
    '          var l = (e.getAttribute("aria-label") || e.innerText || "").toLowerCase();',
    '          return l.startsWith("invite ");',
    '        });',
    '        if (conn) { conn.click(); setTimeout(clickAddNote, 800); }',
    '        else { console.log("Connect not found in More menu"); }',
    '      }, 600);',
    '    } else { console.log("No Connect or More button found"); }',
    '    return;',
    '  }',
    '  connectBtn.click();',
    '  setTimeout(clickAddNote, 800);',
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

  console.log(`  Sending connect invite for ${profile.name} (tab ${tabIndex})...`);
  injectJavaScriptIntoChrome(tabIndex, generateConnectScript(message));
}

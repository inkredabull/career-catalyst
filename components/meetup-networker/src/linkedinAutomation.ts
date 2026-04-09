import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { LinkedInProfile } from './profileLookup.js';

function generateConnectScript(message: string): string {
  return `(function() {
    var message = ${JSON.stringify(message)};

    function fillNote() {
      var ta = document.querySelector('textarea');
      if (!ta) { console.log('Textarea not found'); return; }
      ta.value = message;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('Note filled');
    }

    function clickAddNote() {
      var btns = Array.from(document.querySelectorAll('button'));
      var addNote = btns.find(function(b) {
        return (b.innerText || '').toLowerCase().includes('add a note');
      });
      if (addNote) { addNote.click(); setTimeout(fillNote, 1500); }
      else { setTimeout(fillNote, 500); }
    }

    var btns = Array.from(document.querySelectorAll('button'));
    var connectBtn = btns.find(function(b) {
      var label = (b.getAttribute('aria-label') || '').toLowerCase();
      var text = (b.innerText || '').toLowerCase().replace(/[^a-z ]/g, '').trim();
      return label.startsWith('invite ') || text === 'connect';
    });

    if (connectBtn) {
      connectBtn.click();
      setTimeout(clickAddNote, 2000);
      return;
    }

    var moreBtn = btns.find(function(b) {
      var label = (b.getAttribute('aria-label') || '').toLowerCase();
      return label.includes('more');
    });
    if (moreBtn) {
      moreBtn.click();
      setTimeout(function() {
        var elems = Array.from(document.querySelectorAll('button, div[role="menuitem"], li[role="menuitem"]'));
        var conn = elems.find(function(e) {
          var l = (e.getAttribute('aria-label') || e.innerText || '').toLowerCase();
          return l.startsWith('invite ') || l.trim() === 'connect';
        });
        if (conn) { conn.click(); setTimeout(clickAddNote, 2000); }
        else { console.log('Connect not found in More menu'); }
      }, 800);
      return;
    }

    console.log('No Connect button found');
  })();`;
}

function injectJavaScriptIntoChrome(tabIndex: number, javascript: string): void {
  // Write JS to a temp file — avoids AppleScript string escaping entirely
  const tmpFile = `/tmp/li_inject_${Date.now()}.js`;
  writeFileSync(tmpFile, javascript, 'utf-8');

  const appleScript = `
set jsCode to read POSIX file "${tmpFile}"
tell application "Google Chrome"
  tell tab ${tabIndex} of front window
    execute javascript jsCode
  end tell
end tell`;

  try {
    execSync('osascript', { input: appleScript, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    console.log(`  ⚠️  Error injecting into tab ${tabIndex}`);
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ignore */ }
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

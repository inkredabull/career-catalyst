import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { LinkedInProfile } from './profileLookup.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function loadConnectTemplate(): string {
  if (process.env.LINKEDIN_MESSAGE_TEMPLATE) return process.env.LINKEDIN_MESSAGE_TEMPLATE;
  try {
    return readFileSync(resolve(projectRoot, 'templates', 'linkedin-connect.txt'), 'utf-8').trim();
  } catch {
    return 'Hi {{firstName}}, looking forward to connecting!';
  }
}

function generateConnectScript(message: string): string {
  return `(function() {
    var message = ${JSON.stringify(message)};

    // Skip if already pending
    var isPending = Array.from(document.querySelectorAll('button')).some(function(b) {
      return (b.innerText || '').trim().toLowerCase() === 'pending';
    });
    if (isPending) { console.log('Skipping — already pending'); return; }

    function fillNote() {
      var ta = document.querySelector('textarea');
      if (!ta) {
        // Try shadow root (LinkedIn renders the invite modal inside a shadow DOM)
        var shadowHost = Array.from(document.querySelectorAll('*')).find(function(el) {
          return el.shadowRoot && el.shadowRoot.querySelector('textarea');
        });
        if (shadowHost) { ta = shadowHost.shadowRoot.querySelector('textarea'); }
      }
      if (!ta) { console.log('Textarea not found'); return; }
      ta.value = message;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
      ta.dispatchEvent(new Event('blur', { bubbles: true }));
      console.log('Note filled: ' + ta.value.slice(0, 30));
    }

    function clickAddNote() {
      var allBtns = Array.from(document.querySelectorAll('button'));
      // Also search shadow roots
      Array.from(document.querySelectorAll('*')).forEach(function(el) {
        if (el.shadowRoot) {
          allBtns = allBtns.concat(Array.from(el.shadowRoot.querySelectorAll('button')));
        }
      });
      var addNote = allBtns.find(function(b) {
        return (b.innerText || '').toLowerCase().includes('add a note');
      });
      if (addNote) { addNote.click(); setTimeout(fillNote, 2000); }
      else { setTimeout(fillNote, 500); }
    }

    var btns = Array.from(document.querySelectorAll('button'));

    // Direct Connect button on profile — may be a <button> or <a> tag
    var connectBtn = Array.from(document.querySelectorAll('button, a')).find(function(b) {
      var label = (b.getAttribute('aria-label') || '').toLowerCase();
      var text = (b.innerText || '').toLowerCase().replace(/[^a-z ]/g, '').trim();
      return label.startsWith('invite ') || text === 'connect';
    });

    if (connectBtn) {
      connectBtn.click();
      setTimeout(clickAddNote, 3000);
      return;
    }

    // Connect hidden behind ... — find the More button near the Message/Follow button
    var anchorBtn = btns.find(function(b) {
      var label = (b.getAttribute('aria-label') || '').toLowerCase();
      var text = (b.innerText || '').trim().toLowerCase();
      return label.startsWith('message ') || text === 'message' || label.startsWith('follow ') || text === 'follow';
    });

    // Walk up from anchor button until we find a container that also has a More button
    var moreBtn = null;
    var node = anchorBtn ? anchorBtn.parentElement : null;
    while (node && !moreBtn) {
      var moreCandidates = Array.from(node.querySelectorAll('button')).filter(function(b) {
        return (b.getAttribute('aria-label') || '').toLowerCase() === 'more';
      });
      if (moreCandidates.length > 0) { moreBtn = moreCandidates[0]; }
      else { node = node.parentElement; }
    }

    // Last resort: try all More buttons from the bottom of the DOM up (profile action one is usually last)
    if (!moreBtn) {
      var allMore = btns.filter(function(b) {
        return (b.getAttribute('aria-label') || '').toLowerCase() === 'more';
      });
      moreBtn = allMore[allMore.length - 1] || null;
    }

    if (moreBtn) {
      moreBtn.click();
      setTimeout(function() {
        // Search entire document for the Connect item that appears in the dropdown
        var elems = Array.from(document.querySelectorAll('button, [role="menuitem"], li, a'));
        var conn = elems.find(function(e) {
          var l = (e.getAttribute('aria-label') || '').toLowerCase();
          var t = (e.innerText || '').trim().toLowerCase();
          return l.startsWith('invite ') || l.includes('to connect') || t === 'connect';
        });
        if (conn) { conn.click(); setTimeout(clickAddNote, 3000); }
        else { console.log('Connect not found in More menu'); }
      }, 1000);
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
  const messageTemplate = loadConnectTemplate();
  const message = messageTemplate
    .replace(/\{\{firstName\}\}/g, firstName)
    .replace(/\{\{summary\}\}/g, summary)
    .replace(/\{\{event\}\}/g, eventName);

  console.log(`  Sending connect invite for ${profile.name} (tab ${tabIndex})...`);
  injectJavaScriptIntoChrome(tabIndex, generateConnectScript(message));
}

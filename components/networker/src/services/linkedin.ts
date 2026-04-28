/**
 * LinkedIn automation via AppleScript + Chrome JS injection.
 * Ported from meetup-networker/linkedinAutomation.ts — updated to use DiscoveredProfile.
 *
 * Prerequisites: Chrome must be the frontmost window with the target profile
 * already loaded in the correct tab.
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { DiscoveredProfile } from '../types.js';

// ---------------------------------------------------------------------------
// Script generation
// ---------------------------------------------------------------------------

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

    // Direct Connect button on profile
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

    // Connect hidden behind "More" button
    var btns = Array.from(document.querySelectorAll('button'));
    var anchorBtn = btns.find(function(b) {
      var label = (b.getAttribute('aria-label') || '').toLowerCase();
      var text = (b.innerText || '').trim().toLowerCase();
      return label.startsWith('message ') || text === 'message' || label.startsWith('follow ') || text === 'follow';
    });

    var moreBtn = null;
    var node = anchorBtn ? anchorBtn.parentElement : null;
    while (node && !moreBtn) {
      var moreCandidates = Array.from(node.querySelectorAll('button')).filter(function(b) {
        return (b.getAttribute('aria-label') || '').toLowerCase() === 'more';
      });
      if (moreCandidates.length > 0) { moreBtn = moreCandidates[0]; }
      else { node = node.parentElement; }
    }

    if (!moreBtn) {
      var allMore = btns.filter(function(b) {
        return (b.getAttribute('aria-label') || '').toLowerCase() === 'more';
      });
      moreBtn = allMore[allMore.length - 1] || null;
    }

    if (moreBtn) {
      moreBtn.click();
      setTimeout(function() {
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

// ---------------------------------------------------------------------------
// AppleScript injection
// ---------------------------------------------------------------------------

function injectJavaScriptIntoChrome(tabIndex: number, javascript: string): void {
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
  } catch {
    console.log(`  ⚠️  Error injecting into tab ${tabIndex}`);
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds the personalised connection message and injects it into the given
 * Chrome tab via AppleScript.
 *
 * @param profile     - Profile whose Connect modal to populate
 * @param tabIndex    - 1-indexed Chrome tab number in the front window
 * @param eventName   - Used for the {{event}} template token (discover workflow)
 * @param messageOverride - Use this exact message instead of the template (reinvite workflow)
 */
export async function openMessageModal(
  profile: DiscoveredProfile,
  tabIndex: number,
  eventName: string,
  messageOverride?: string
): Promise<void> {
  let message: string;

  if (messageOverride) {
    message = messageOverride;
  } else {
    const firstName = profile.firstName ?? profile.name.split(' ')[0] ?? '';
    const summary = profile.condensedSummary ?? profile.domain ?? 'your industry';
    const template =
      process.env.LINKEDIN_MESSAGE_TEMPLATE ?? 'Hi {{firstName}}, looking forward to connecting!';
    message = template
      .replace(/\{\{firstName\}\}/g, firstName)
      .replace(/\{\{summary\}\}/g, summary)
      .replace(/\{\{event\}\}/g, eventName);
  }

  console.log(`  Sending connect invite for ${profile.name} (tab ${tabIndex})…`);
  injectJavaScriptIntoChrome(tabIndex, generateConnectScript(message));
}

/**
 * Returns the current number of tabs in the front Chrome window.
 * Used to calculate tab offsets when opening new profile tabs.
 */
export function getChromeFrontWindowTabCount(): number {
  try {
    const result = execSync(
      `osascript -e 'tell application "Google Chrome" to count tabs of front window'`,
      { encoding: 'utf-8' }
    ).trim();
    return parseInt(result, 10);
  } catch {
    console.log('  Note: could not detect existing tab count, assuming 1');
    return 1;
  }
}

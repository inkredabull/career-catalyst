/**
 * LinkedIn automation via AppleScript + Chrome JS injection.
 *
 * ## How it works
 *
 * 1. **Tab management** — `getChromeFrontWindowTabCount()` asks Chrome (via
 *    AppleScript) how many tabs are currently open in the front window.  The
 *    caller records this count before opening new profile tabs so it can derive
 *    each new tab's 1-based index (`startCount + i + 1`).
 *
 * 2. **Script generation** — `generateConnectScript()` builds a self-contained
 *    IIFE string that will run inside the LinkedIn profile page.  The script:
 *    - Bails early if a "Pending" button is already present.
 *    - Looks for a visible **Connect** button on the profile hero.
 *    - If Connect is hidden, clicks the **More** dropdown and finds Connect
 *      inside the menu.
 *    - After clicking Connect, waits 3 s for the modal, then clicks
 *      **Add a note** and fills the textarea (also checks shadow-DOM roots).
 *
 * 3. **Injection** — `injectJavaScriptIntoChrome()` writes the script to a
 *    temp file under `/tmp/`, then passes it to `osascript` via stdin using
 *    AppleScript's `execute javascript` command on the target tab.  The temp
 *    file is deleted in a `finally` block regardless of outcome.
 *
 * 4. **Message templating** — `openMessageModal()` resolves the final message:
 *    either a caller-supplied override (reinvite workflow) or the
 *    `LINKEDIN_MESSAGE_TEMPLATE` env-var template with `{{firstName}}`,
 *    `{{summary}}`, and `{{event}}` tokens substituted.
 *
 * ## Prerequisites
 * - macOS (AppleScript + `osascript`)
 * - Google Chrome must be the frontmost application
 * - Target profile tabs must already be loaded before injection is called
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
      if (ta) {
        ta.value = message;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
        ta.dispatchEvent(new Event('blur', { bubbles: true }));
        console.log('Note filled (textarea): ' + ta.value.slice(0, 30));
        return;
      }
      // LinkedIn may use contenteditable instead of textarea
      var ce = document.querySelector('[contenteditable="true"]') ||
               document.querySelector('[role="textbox"]');
      if (ce) {
        ce.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, message);
        if (!ce.textContent || ce.textContent.trim() === '') {
          ce.textContent = message;
          ce.dispatchEvent(new Event('input', { bubbles: true }));
        }
        console.log('Note filled (contenteditable): ' + (ce.textContent || '').slice(0, 30));
        return;
      }
      console.log('Textarea not found');
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
      else { setTimeout(fillNote, 2500); }
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

    // Connect hidden behind "More" / "..." button
    // Primary: LinkedIn's three-dots overflow icon has a stable SVG id
    var moreBtn = null;
    var overflowSvgs = Array.from(document.querySelectorAll('svg[id="overflow-web-ios-small"]'));
    for (var si = 0; si < overflowSvgs.length; si++) {
      var svgBtn = overflowSvgs[si].closest('button');
      if (svgBtn) { moreBtn = svgBtn; break; }
    }

    // Fallback: aria-label / text heuristics scoped near Message/Follow anchor
    if (!moreBtn) {
      function isMoreTrigger(el) {
        var label = (el.getAttribute('aria-label') || '').trim().toLowerCase();
        var text  = (el.innerText || '').trim();
        return label === 'more' || text === '...' || text === '…';
      }
      var anchorBtn = Array.from(document.querySelectorAll('button')).find(function(b) {
        var label = (b.getAttribute('aria-label') || '').toLowerCase();
        var text = (b.innerText || '').trim().toLowerCase().replace(/^[^a-z]+/, '');
        return label.startsWith('message ') || text === 'message' || label.startsWith('follow ') || text === 'follow';
      });
      var node = anchorBtn ? anchorBtn.parentElement : null;
      while (node && !moreBtn) {
        var moreCandidates = Array.from(node.querySelectorAll('button')).filter(isMoreTrigger);
        if (moreCandidates.length > 0) { moreBtn = moreCandidates[0]; }
        else { node = node.parentElement; }
      }
      if (!moreBtn) {
        moreBtn = Array.from(document.querySelectorAll('button')).find(isMoreTrigger) || null;
      }
    }

    if (moreBtn) {
      moreBtn.click();
      setTimeout(function() {
        // LinkedIn dropdown items are plain <div> elements — broaden beyond button/li/a
        var elems = Array.from(document.querySelectorAll('div, button, li, a, [role]'));
        var conn = elems.find(function(e) {
          var l = (e.getAttribute('aria-label') || '').toLowerCase();
          var t = (e.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase();
          // Must be short (menu item) and match connect intent
          return t.length < 40 && (l.startsWith('invite ') || l.includes('to connect') || t === 'connect');
        });
        if (conn) { conn.click(); setTimeout(clickAddNote, 3000); }
        else { console.log('Connect not found in More menu'); }
      }, 2000);
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

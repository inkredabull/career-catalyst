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
    var LOG = function(msg) { console.log('[NETWORKER] ' + msg); };
    var message = ${JSON.stringify(message)};
    LOG('Script injected. Message: ' + message.slice(0, 40) + '…');

    // Skip if already pending
    var isPending = Array.from(document.querySelectorAll('button')).some(function(b) {
      return (b.innerText || '').trim().toLowerCase() === 'pending';
    });
    if (isPending) { LOG('Skipping — already pending'); return; }

    function fillNote(retryCount) {
      retryCount = retryCount || 0;
      LOG('fillNote() called (attempt ' + (retryCount + 1) + ')');
      var ta = document.querySelector('textarea');
      if (!ta) {
        LOG('No plain textarea — checking shadow DOM');
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
        LOG('Note filled (textarea): ' + ta.value.slice(0, 40));
        return;
      }
      LOG('No textarea — checking contenteditable / role=textbox');
      var ce = document.querySelector('[contenteditable="true"]') ||
               document.querySelector('[contenteditable]') ||
               document.querySelector('[role="textbox"]');
      if (ce) {
        ce.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, message);
        if (!ce.textContent || ce.textContent.trim() === '') {
          ce.textContent = message;
          ce.dispatchEvent(new Event('input', { bubbles: true }));
        }
        LOG('Note filled (contenteditable): ' + (ce.textContent || '').slice(0, 40));
        return;
      }
      if (retryCount < 4) {
        LOG('Nothing found — retrying in 1500ms (attempt ' + (retryCount + 2) + ')');
        setTimeout(function() { fillNote(retryCount + 1); }, 1500);
        return;
      }
      LOG('ERROR: no textarea or contenteditable after ' + (retryCount + 1) + ' attempts — modal may not be open');
      // Dump visible dialog buttons to help diagnose
      var dialog = document.querySelector('[role="dialog"]');
      if (dialog) {
        var btns = Array.from(dialog.querySelectorAll('button, [role="button"], a'));
        LOG('Dialog found with ' + btns.length + ' clickables:');
        btns.slice(0, 8).forEach(function(b) { LOG('  "' + (b.innerText || b.textContent || '').trim().slice(0, 60) + '"'); });
      } else {
        LOG('No [role="dialog"] found on page');
      }
    }

    function clickAddNote() {
      LOG('clickAddNote() called');
      var dialog = document.querySelector('[role="dialog"]');
      LOG('Modal dialog present: ' + (dialog ? 'YES' : 'NO'));
      // Broaden beyond button — LinkedIn uses role="button" and sometimes spans
      var allInteractive = Array.from(document.querySelectorAll('button, [role="button"], a'));
      Array.from(document.querySelectorAll('*')).forEach(function(el) {
        if (el.shadowRoot) {
          allInteractive = allInteractive.concat(Array.from(el.shadowRoot.querySelectorAll('button, [role="button"]')));
        }
      });
      var addNote = allInteractive.find(function(b) {
        var text = (b.innerText || b.textContent || '').toLowerCase();
        return text.includes('add a note') || text.includes('add note');
      });
      if (addNote) {
        LOG('"Add a note" button found: "' + (addNote.innerText || '').trim() + '" — clicking, fillNote in 2000ms');
        addNote.click();
        setTimeout(function() { fillNote(0); }, 2000);
      } else {
        // Dump what IS in the dialog to debug
        if (dialog) {
          var dlgBtns = Array.from(dialog.querySelectorAll('button, [role="button"]'));
          LOG('Dialog buttons (' + dlgBtns.length + '):');
          dlgBtns.forEach(function(b) { LOG('  "' + (b.innerText || b.textContent || '').trim().slice(0, 60) + '"'); });
        }
        LOG('"Add a note" not found — trying fillNote(0) directly in 1000ms');
        setTimeout(function() { fillNote(0); }, 1000);
      }
    }

    // Scope all button searches to the profile hero to avoid sidebar "Connect" buttons
    // (LinkedIn shows other people's Connect buttons in "People also viewed")
    function getProfileActionRoot() {
      var h1 = document.querySelector('h1');
      if (!h1) return document.body;
      var node = h1.parentElement;
      while (node && node !== document.body) {
        if (node.querySelectorAll('button').length >= 2) return node;
        node = node.parentElement;
      }
      return document.body;
    }
    var actionRoot = getProfileActionRoot();
    LOG('Profile action root: ' + actionRoot.tagName + (actionRoot.id ? '#' + actionRoot.id : ''));

    // Direct Connect button — aria-label is person-specific; text===connect scoped to hero
    var connectBtn = Array.from(actionRoot.querySelectorAll('button, a')).find(function(b) {
      var label = (b.getAttribute('aria-label') || '').toLowerCase();
      var text = (b.innerText || '').toLowerCase().replace(/[^a-z ]/g, '').trim();
      return label.startsWith('invite ') || text === 'connect';
    });

    if (connectBtn) {
      var connectLabel = connectBtn.getAttribute('aria-label') || connectBtn.innerText || '';
      LOG('Direct Connect button found: "' + connectLabel.trim() + '" — clicking');
      connectBtn.click();
      setTimeout(clickAddNote, 3000);
      return;
    }

    LOG('No direct Connect in profile hero — looking for More/... button');

    function isMoreTrigger(el) {
      var label = (el.getAttribute('aria-label') || '').trim().toLowerCase();
      var text  = (el.innerText || '').trim();
      return label === 'more' || text === '...' || text === '…';
    }

    // Find anchor (Follow/Message) within hero, then walk up to find More nearby
    var anchorBtn = Array.from(actionRoot.querySelectorAll('button')).find(function(b) {
      var label = (b.getAttribute('aria-label') || '').toLowerCase();
      var text = (b.innerText || '').trim().toLowerCase().replace(/^[^a-z]+/, '');
      return label.startsWith('message ') || text === 'message' || label.startsWith('follow ') || text === 'follow';
    });
    LOG('Anchor button (Follow/Message): ' + (anchorBtn ? (anchorBtn.getAttribute('aria-label') || anchorBtn.innerText).trim() : 'NOT FOUND'));

    var moreBtn = null;

    // 1. SVG detection scoped to actionRoot first
    var svgsInHero = Array.from(actionRoot.querySelectorAll('svg[id="overflow-web-ios-small"]'));
    LOG('overflow-web-ios-small SVGs in profile hero: ' + svgsInHero.length);
    for (var si = 0; si < svgsInHero.length; si++) {
      var svgBtn = svgsInHero[si].closest('button');
      if (svgBtn) { moreBtn = svgBtn; LOG('More button found via SVG in hero (index ' + si + ')'); break; }
    }

    // 2. Heuristic scoped to anchor container
    if (!moreBtn && anchorBtn) {
      var node = anchorBtn.parentElement;
      while (node && !moreBtn) {
        var moreCandidates = Array.from(node.querySelectorAll('button')).filter(isMoreTrigger);
        if (moreCandidates.length > 0) { moreBtn = moreCandidates[0]; LOG('More button found via heuristic in anchor container'); }
        else { node = node.parentElement; }
      }
    }

    // 3. Global SVG fallback (whole page)
    if (!moreBtn) {
      LOG('Scoped search failed — trying global SVG scan');
      var allSvgs = Array.from(document.querySelectorAll('svg[id="overflow-web-ios-small"]'));
      LOG('Global overflow SVGs: ' + allSvgs.length);
      for (var gi = 0; gi < allSvgs.length; gi++) {
        var gBtn = allSvgs[gi].closest('button');
        if (gBtn) { moreBtn = gBtn; LOG('More button found via global SVG (index ' + gi + ')'); break; }
      }
    }

    // 4. Global heuristic last resort
    if (!moreBtn) {
      moreBtn = Array.from(document.querySelectorAll('button')).find(isMoreTrigger) || null;
      if (moreBtn) LOG('More button found via global heuristic');
    }

    if (moreBtn) {
      LOG('Clicking More button — waiting 2000ms for dropdown');
      moreBtn.click();
      setTimeout(function() {
        // LinkedIn dropdown items are plain <div> elements — broaden beyond button/li/a
        var elems = Array.from(document.querySelectorAll('div, button, li, a, [role]'));
        LOG('Dropdown open — scanning ' + elems.length + ' elements for Connect');
        var conn = elems.find(function(e) {
          var l = (e.getAttribute('aria-label') || '').toLowerCase();
          var t = (e.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase();
          return t.length < 40 && (l.startsWith('invite ') || l.includes('to connect') || t === 'connect');
        });
        if (conn) {
          var connLabel = conn.getAttribute('aria-label') || conn.innerText || '';
          LOG('Connect item found in dropdown: "' + connLabel.trim().slice(0, 40) + '" — clicking');
          conn.click();
          setTimeout(clickAddNote, 3000);
        } else {
          LOG('ERROR: Connect not found in More menu — dumping first 10 short items:');
          elems.filter(function(e) { return (e.innerText || '').trim().length > 0 && (e.innerText || '').trim().length < 40; })
               .slice(0, 10)
               .forEach(function(e) { LOG('  item: "' + (e.innerText || '').trim() + '"'); });
        }
      }, 2000);
      return;
    }

    LOG('ERROR: No Connect button and no More button found on this page');
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

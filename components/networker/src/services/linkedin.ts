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
import { writeFileSync, unlinkSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { DiscoveredProfile } from '../types.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function loadConnectTemplate(): string {
  if (process.env.LINKEDIN_MESSAGE_TEMPLATE) return process.env.LINKEDIN_MESSAGE_TEMPLATE;
  try {
    return readFileSync(resolve(projectRoot, 'templates', 'linkedin-connect.txt'), 'utf-8').trim();
  } catch {
    return 'Hi {{firstName}}, looking forward to connecting!';
  }
}

// ---------------------------------------------------------------------------
// Script generation
// ---------------------------------------------------------------------------

function generateConnectScript(message: string): string {
  return `(async function() {
    const LOG = msg => console.log('[NETWORKER] ' + msg);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const message = ${JSON.stringify(message)};
    LOG('Script injected. Message: ' + message.slice(0, 40) + '…');

    // Skip if already pending
    const isPending = Array.from(document.querySelectorAll('button'))
      .some(b => (b.innerText || '').trim().toLowerCase() === 'pending');
    if (isPending) { LOG('Skipping — already pending'); return; }

    // Deep query: main document first, then known LinkedIn shadow hosts, then all shadow roots
    const deepQ = sel => {
      let el = document.querySelector(sel);
      if (el) return el;
      for (const id of ['interop-shadowdom', 'interop-outlet']) {
        const host = document.querySelector('[data-testid="' + id + '"]') || document.getElementById(id);
        if (host?.shadowRoot) { el = host.shadowRoot.querySelector(sel); if (el) return el; }
      }
      for (const host of document.querySelectorAll('*')) {
        if (host.shadowRoot) { el = host.shadowRoot.querySelector(sel); if (el) return el; }
      }
      return null;
    };
    // "Add a note" may vary in aria-label — also find by button text across all roots
    const findAddNote = () => {
      let btn = deepQ('button[aria-label="Add a note"]');
      if (btn) return btn;
      const roots = [document, ...Array.from(document.querySelectorAll('*')).filter(h => h.shadowRoot).map(h => h.shadowRoot)];
      for (const root of roots) {
        btn = Array.from(root.querySelectorAll('button')).find(b =>
          (b.innerText || b.textContent || '').trim().toLowerCase().includes('add a note')
        );
        if (btn) return btn;
      }
      return null;
    };

    // Scope to main profile topcard — walk up from h1 to find the Topcard ancestor,
    // guaranteeing we target the profile being viewed rather than a sidebar card.
    const getTopCard = () => {
      const h1 = document.querySelector('h1');
      if (h1) {
        let node = h1.parentElement;
        while (node && node !== document.body) {
          const ck = node.getAttribute('componentkey') || '';
          if (ck.endsWith('Topcard') || ck.includes('Topcard')) return node;
          node = node.parentElement;
        }
      }
      return document.querySelector('[componentkey*="Topcard"]') || document;
    };
    const topCard = getTopCard();
    LOG('Top card: ' + (topCard === document ? 'NOT FOUND (fallback to document)' : 'found, componentkey="' + (topCard.getAttribute('componentkey') || '').slice(-30) + '"'));

    // Step 1: Direct Connect button scoped to top card
    const directConnect = Array.from(topCard.querySelectorAll('button, a')).find(b => {
      const label = (b.getAttribute('aria-label') || '').toLowerCase();
      const text = (b.innerText || '').toLowerCase().replace(/[^a-z ]/g, '').trim();
      return label.startsWith('invite ') || text === 'connect';
    });

    if (directConnect) {
      LOG('Direct Connect found: "' + (directConnect.getAttribute('aria-label') || directConnect.innerText || '').trim() + '" — clicking');
      directConnect.click();
      await sleep(3000);
    } else {
      LOG('No direct Connect — looking for More/··· button');

      // Step 2a: More button — SVG id first, then aria-label*="More actions", then heuristic
      let moreBtn = null;
      const overflowSvgs = topCard.querySelectorAll('svg[id="overflow-web-ios-small"]');
      LOG('overflow-web-ios-small SVGs in top card: ' + overflowSvgs.length);
      for (const svg of overflowSvgs) {
        const btn = svg.closest('button');
        if (btn) { moreBtn = btn; LOG('More button found via SVG id'); break; }
      }
      if (!moreBtn) {
        moreBtn = topCard.querySelector('button[aria-label*="More actions"]') ||
                  Array.from(topCard.querySelectorAll('button')).find(b => {
                    const label = (b.getAttribute('aria-label') || '').trim().toLowerCase();
                    const text = (b.innerText || '').trim();
                    return label === 'more' || text === '...' || text === '…';
                  }) || null;
        if (moreBtn) LOG('More button found via fallback: aria-label="' + (moreBtn.getAttribute('aria-label') || '') + '"');
      }

      if (!moreBtn) {
        LOG('ERROR: Could not find Connect or More button on this profile');
        return;
      }

      moreBtn.click();
      LOG('More button clicked — waiting 2000ms for dropdown');
      await sleep(2000);

      // Step 2b: Connect item — target a[role="menuitem"] specifically (avoids parent divs with same text)
      const conn = Array.from(document.querySelectorAll('a[role="menuitem"]')).find(el => {
        const text = (el.innerText || '').replace(/\\s+/g, ' ').trim().toLowerCase();
        const label = (el.getAttribute('aria-label') || '').toLowerCase();
        const href = (el.getAttribute('href') || '').toLowerCase();
        return text === 'connect' || label.includes('invite') || href.includes('invite');
      });
      LOG('Connect menu item: ' + (conn ? 'FOUND href="' + (conn.getAttribute('href') || '') + '"' : 'NOT FOUND'));

      if (!conn) {
        LOG('ERROR: Connect not found in dropdown — dumping menu items:');
        Array.from(document.querySelectorAll('a[role="menuitem"], div[role="menuitem"]'))
          .forEach(el => LOG('  menuitem: "' + (el.innerText || '').trim().slice(0, 60) + '"'));
        return;
      }
      conn.click();
      await sleep(1000);
    }

    // Step 3: Poll for "Add a note" button across all shadow roots (up to 10s)
    LOG('Polling for "Add a note" button (up to 10s)');
    let addNote = null;
    const addNoteDeadline = Date.now() + 10000;
    while (Date.now() < addNoteDeadline) {
      addNote = findAddNote();
      if (addNote) break;
      await sleep(200);
    }

    if (addNote) {
      LOG('"Add a note" found — clicking');
      addNote.click();
      LOG('Polling for textarea (up to 5s)');
      const taDeadline = Date.now() + 5000;
      while (Date.now() < taDeadline) {
        if (deepQ('textarea')) break;
        await sleep(200);
      }
    } else {
      LOG('"Add a note" not found after 10s — attempting direct textarea fill');
    }

    // Step 4: Fill textarea via native setter (triggers React synthetic events)
    const ta = deepQ('textarea');
    LOG('textarea: ' + (ta ? 'FOUND id="' + (ta.id || 'none') + '"' : 'NOT FOUND'));
    if (ta) {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(ta, message);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
      LOG('Textarea filled: ' + message.slice(0, 40));
    } else {
      LOG('ERROR: no textarea found — modal may not have opened');
    }
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
    const template = loadConnectTemplate();
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

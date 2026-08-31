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

import { DiscoveredProfile } from '../types.js';
import {
  generateConnectScript,
  loadTemplate,
  buildMessage,
  countTabs,
  injectScript,
} from '@inkredabull/career-catalyst-linkedin-automation';

export async function openMessageModal(
  profile: DiscoveredProfile,
  tabIndex: number,
  eventName: string,
  messageOverride?: string
): Promise<void> {
  const message = messageOverride ?? buildMessage(loadTemplate(), {
    firstName:        profile.firstName ?? profile.name.split(' ')[0] ?? '',
    summary:          profile.condensedSummary ?? profile.domain ?? 'your industry',
    condensedSummary: profile.condensedSummary ?? '',
    event:            eventName,
  });
  console.log(`  Sending connect invite for ${profile.name} (tab ${tabIndex})…`);
  injectScript(tabIndex, generateConnectScript(message));
}

export function getChromeFrontWindowTabCount(): number {
  const n = countTabs();
  if (n === 0) console.log('  Note: could not detect existing tab count, assuming 1');
  return n || 1;
}

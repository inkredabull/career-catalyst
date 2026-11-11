/**
 * attendeeScraper: reads an event title, date and the full attendee list from a
 * Luma or Partiful page in the user's logged-in Chrome (AppleScript + JS injection,
 * same mechanism as `send`). Requires Chrome > View > Developer > "Allow JavaScript
 * from Apple Events", and that the Chrome profile is registered for the event, since
 * Luma hides the guest list from everyone else.
 */

import { execFileSync } from 'child_process';
import { injectScript, sleep } from '@inkredabull/career-catalyst-linkedin-automation';

export interface ScrapedEvent {
  title: string;
  /** Month (1-12) and day as displayed on the page. */
  month: number;
  day: number;
  year: number;
  /** True when the date could not be read and today's date was used instead. */
  dateGuessed: boolean;
  names: string[];
  /** Attendee count the page advertises (e.g. "287 Went"), when readable. */
  expectedCount?: number;
}

interface ScriptState {
  status: 'starting' | 'running' | 'done' | 'error';
  error?: string;
  title?: string;
  month?: number;
  day?: number;
  year?: number;
  expected?: number;
  names: string[];
}

/** Runs in the page. Kicks off async work and parks results on window.__ccCapture. */
const CAPTURE_SCRIPT = `
(function () {
  if (window.__ccCapture && window.__ccCapture.status === 'running') return 'already-running';
  var S = window.__ccCapture = { status: 'running', names: [] };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };

  function readMeta() {
    var h1 = document.querySelector('h1');
    S.title = ((h1 && h1.innerText) || document.title.replace(/\\s*[·|\\-]\\s*(Luma|Partiful).*$/i, '')).trim();
    var body = (document.querySelector('main') || document.body).innerText;
    var m = body.match(/(?:Mon|Tues?|Wed(?:nes)?|Thu(?:rs)?|Fri|Sat(?:ur)?|Sun)[a-z]*,?\\s+([A-Z][a-z]{2,8})\\.?\\s+(\\d{1,2})/);
    if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) {
      S.month = MONTHS[m[1].slice(0, 3).toLowerCase()];
      S.day = parseInt(m[2], 10);
    }
    var ys = (document.documentElement.innerHTML.match(/"start_at":"(\\d{4})-/) || [])[1];
    if (ys) S.year = parseInt(ys, 10);
    var c = body.match(/(\\d[\\d,]*)\\s+(?:Going|Went|Attending|Attended)\\b/i);
    if (c) S.expected = parseInt(c[1].replace(/,/g, ''), 10);
  }

  function dialog() { return document.querySelector('[role=dialog]'); }

  function readNames(root) {
    var out = [];
    var nodes = root.querySelectorAll('.name');
    if (!nodes.length) nodes = root.querySelectorAll('a[href*="/user/"], a[href*="/u/"]');
    nodes.forEach(function (n) {
      if (n.classList.contains('placeholder')) return;
      var t = (n.innerText || '').split('\\n')[0].trim();
      if (t) out.push(t);
    });
    return out;
  }

  function candidates() {
    var all = Array.prototype.slice.call(document.querySelectorAll('a, button, div, span'));
    var list = [];
    all.forEach(function (e) {
      var t = (e.innerText || '').trim();
      if (!t || t.length > 120) return;
      if (/^list$/i.test(t) || /\\band\\s+\\d+\\s+others?$/i.test(t) || /^\\d[\\d,]*\\s+(going|went|attending|attended)\\b/i.test(t) || /^see all$/i.test(t)) list.push(e);
    });
    // smallest elements first, then their parents (Luma attaches the handler to a wrapper)
    list.sort(function (a, b) { return a.innerText.length - b.innerText.length; });
    var out = [];
    list.forEach(function (e) { out.push(e); if (e.parentElement) out.push(e.parentElement); });
    return out;
  }

  async function openList() {
    var cs = candidates();
    for (var i = 0; i < cs.length; i++) {
      cs[i].click();
      await sleep(1400);
      var d = dialog();
      if (!d) continue;
      if (/register to view guest list|guest list is only accessible/i.test(d.innerText)) {
        S.error = 'not-registered';
        return null;
      }
      if (readNames(d).length > 0) return d;
    }
    return null;
  }

  (async function () {
    try {
      readMeta();
      var d = await openList();
      if (!d) {
        S.status = 'error';
        S.error = S.error || 'guest list not found (no clickable Going/Went list or modal had no names)';
        return;
      }
      var scroller = d.querySelector('.overflow-auto') || d;
      var seen = new Map();
      var stable = 0;
      for (var i = 0; i < 400 && stable < 6; i++) {
        var before = seen.size;
        readNames(d).forEach(function (n) { if (!seen.has(n)) seen.set(n, true); });
        S.names = Array.from(seen.keys());
        if (S.expected && seen.size >= S.expected) break;
        stable = seen.size === before ? stable + 1 : 0;
        scroller.scrollTop = scroller.scrollHeight;
        await sleep(700);
      }
      S.names = Array.from(seen.keys());
      S.status = 'done';
    } catch (e) {
      S.status = 'error';
      S.error = String(e && e.message || e);
    }
  })();
  return 'started';
})()
`;

const READ_STATE_SCRIPT = `JSON.stringify(window.__ccCapture || { status: 'starting', names: [] })`;

function osa(script: string, ...args: string[]): string {
  return execFileSync('osascript', ['-', ...args], { input: script, encoding: 'utf-8' }).trim();
}

/** Opens `url` in a new tab of Chrome's front window; returns the tab index. */
function openNewTab(url: string): number {
  const out = osa(`
on run argv
  tell application "Google Chrome"
    activate
    if (count of windows) is 0 then make new window
    tell front window to make new tab with properties {URL:item 1 of argv}
    return active tab index of front window
  end tell
end run`, url);
  return parseInt(out, 10);
}

function closeTabAt(index: number): void {
  try {
    osa(`tell application "Google Chrome" to close tab ${index} of front window`);
  } catch { /* tab may already be gone */ }
}

async function waitForLoad(tab: number, timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (injectScript(tab, 'document.readyState').trim() === 'complete') break;
    } catch { /* tab still initialising */ }
    await sleep(700);
  }
  await sleep(2500); // let the SPA hydrate
}

export async function scrapeEvent(url: string, opts: { keepTabOpen?: boolean } = {}): Promise<ScrapedEvent> {
  const tab = openNewTab(url);
  try {
    await waitForLoad(tab);
    injectScript(tab, CAPTURE_SCRIPT);

    let state: ScriptState = { status: 'starting', names: [] };
    let lastCount = -1;
    const deadline = Date.now() + 5 * 60_000;
    while (Date.now() < deadline) {
      await sleep(1500);
      state = JSON.parse(injectScript(tab, READ_STATE_SCRIPT)) as ScriptState;
      if (state.names.length !== lastCount) {
        lastCount = state.names.length;
        const of = state.expected ? ` / ${state.expected}` : '';
        process.stdout.write(`\r  Collected ${lastCount}${of} names…   `);
      }
      if (state.status === 'done' || state.status === 'error') break;
    }
    process.stdout.write('\n');

    if (state.status === 'error') {
      if (state.error === 'not-registered') {
        throw new Error('Luma is hiding the guest list: this Chrome profile is not registered for the event. Register (or sign in) in Chrome and re-run.');
      }
      throw new Error(`Could not read attendee list: ${state.error}`);
    }
    if (state.status !== 'done') throw new Error('Timed out waiting for the attendee list to load.');

    const now = new Date();
    const dateGuessed = !state.month || !state.day;
    return {
      title: state.title || 'Untitled event',
      month: state.month ?? now.getMonth() + 1,
      day: state.day ?? now.getDate(),
      year: state.year ?? now.getFullYear(),
      dateGuessed,
      names: state.names,
      expectedCount: state.expected,
    };
  } finally {
    if (!opts.keepTabOpen) closeTabAt(tab);
  }
}

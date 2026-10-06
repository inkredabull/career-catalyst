/**
 * Generates a self-contained IIFE that runs inside a LinkedIn profile page.
 * Finds the Connect button (direct or via More dropdown), clicks it, waits for
 * the modal, clicks "Add a note", and fills the textarea with the given message.
 * Bails early with 'CONNECTED' if the profile is already a 1st-degree connection
 * (detected via the "· 1st" degree badge next to the name) — no point sending an
 * invite to someone you can already message directly.
 *
 * Pure function — no I/O, safe to unit test.
 */
export function generateConnectScript(message: string): string {
  return `(function() {
    const LOG = msg => console.log('[CC] ' + msg);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const message = ${JSON.stringify(message)};
    LOG('Connect script injected. Message: ' + message.slice(0, 40) + '…');

    // Degree badge ("1st"/"2nd"/"3rd") renders as a short span near the <h1>
    // name — check it before anything else so we never click Connect on
    // someone we're already connected to.
    const degreeBadge = (() => {
      const h1 = document.querySelector('h1');
      if (!h1) return null;
      let node = h1.parentElement;
      let hops = 0;
      while (node && node !== document.body && hops < 4) {
        const span = Array.from(node.querySelectorAll('span')).find(s => {
          const t = (s.innerText || s.textContent || '').trim();
          return t === '1st' || t === '2nd' || t === '3rd';
        });
        if (span) return (span.innerText || span.textContent || '').trim();
        node = node.parentElement;
        hops++;
      }
      return null;
    })();
    if (degreeBadge === '1st') { LOG('Skipping — already a 1st-degree connection'); return 'CONNECTED'; }

    const isPending = Array.from(document.querySelectorAll('button'))
      .some(b => (b.innerText || '').trim().toLowerCase() === 'pending');
    if (isPending) { LOG('Skipping — already pending'); return 'PENDING'; }

    (async function() {

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

    // Scoping every button/link search to the profile's own hero region is a
    // safety requirement, not a nicety: the sidebar ("More profiles for you")
    // renders its own Connect buttons for other people on the same page, and
    // a search that falls back to document-wide would risk clicking Connect
    // on the wrong profile entirely. If no reliable scope is found, abort
    // rather than widen the search.
    const getTopCard = () => {
      const h1 = document.querySelector('h1');
      if (!h1) return null;
      let node = h1.parentElement;
      let hops = 0;
      while (node && node !== document.body && hops < 8) {
        const ck = node.getAttribute('componentkey') || '';
        if (ck.toLowerCase().includes('topcard')) return node;
        const hasMessageControl = Array.from(node.querySelectorAll('button, a')).some(b => {
          const text = (b.innerText || '').trim().toLowerCase();
          const label = (b.getAttribute('aria-label') || '').toLowerCase();
          return text === 'message' || label.startsWith('message ') || label.includes('send a message');
        });
        if (hasMessageControl) return node;
        node = node.parentElement;
        hops++;
      }
      return null;
    };
    const topCard = getTopCard();
    if (!topCard) {
      LOG('ERROR: could not scope to the profile hero (no Topcard/Message landmark within 8 ancestors of <h1>) — aborting rather than risk clicking the wrong Connect button');
      return;
    }

    const matchConnect = b => {
      const label = (b.getAttribute('aria-label') || '').toLowerCase();
      const text = (b.innerText || '').toLowerCase().replace(/[^a-z ]/g, '').trim();
      return label.startsWith('invite ') || text === 'connect';
    };

    let directConnect = Array.from(topCard.querySelectorAll('button, a')).find(matchConnect);

    if (!directConnect) {
      // LinkedIn sometimes renders Connect in its own banner below the hero
      // ("Connect if you know each other") rather than inside the Topcard
      // region, so a hero-only search misses it. Widen to the whole page,
      // but explicitly exclude suggestion rails ("More profiles for you",
      // "People you may know", etc.) — those render other people's own
      // Connect buttons on the same page, and clicking into one of those
      // would send an invite to the wrong person entirely.
      const isVisible = el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const railHeadings = ['more profiles for you', 'people you may know', 'people also viewed', 'similar profiles'];
      const excludedRegions = [];
      for (const el of document.querySelectorAll('h2, h3, span, div')) {
        const text = (el.innerText || el.textContent || '').trim().toLowerCase();
        if (!railHeadings.includes(text)) continue;
        let node = el.parentElement;
        let hops = 0;
        while (node && node !== document.body && hops < 6) {
          if (node.tagName === 'ASIDE' || node.querySelectorAll('a[href*="/in/"]').length > 1) {
            excludedRegions.push(node);
            break;
          }
          node = node.parentElement;
          hops++;
        }
      }
      const isExcluded = el => excludedRegions.some(region => region.contains(el));

      directConnect = Array.from(document.querySelectorAll('button, a')).find(b =>
        isVisible(b) && !isExcluded(b) && matchConnect(b)
      );
    }

    if (directConnect) {
      directConnect.click();
      await sleep(3000);
    } else {
      let moreBtn = null;
      for (const svg of topCard.querySelectorAll('svg[id="overflow-web-ios-small"]')) {
        const btn = svg.closest('button');
        if (btn) { moreBtn = btn; break; }
      }
      if (!moreBtn) {
        moreBtn = topCard.querySelector('button[aria-label*="More actions"]') ||
          Array.from(topCard.querySelectorAll('button')).find(b => {
            const label = (b.getAttribute('aria-label') || '').trim().toLowerCase();
            const text = (b.innerText || '').trim();
            return label === 'more' || label.startsWith('more actions') ||
              text === '...' || text === '…' || text === '\\u2022\\u2022\\u2022';
          }) || null;
      }
      if (!moreBtn) { LOG('ERROR: no Connect or More button found'); return; }

      // LinkedIn's current markup uses hashed/atomic CSS classes with no
      // stable role or class to target, so instead of guessing selectors we
      // diff the DOM before/after opening the menu and look for whatever
      // newly-appeared (or newly-visible) element's text is exactly
      // "Connect". Scoping to the diff — not a document-wide search — is
      // deliberate: the sidebar ("More profiles for you") already has its
      // own Connect buttons for other people, and a global text search would
      // risk clicking Connect on the wrong profile.
      const isVisible = el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const allEls = () => Array.from(document.querySelectorAll('*'));
      const beforeEls = new Set(allEls());
      const beforeVisible = new Set(allEls().filter(isVisible));

      moreBtn.click();

      LOG('Polling for the More dropdown to open (up to 5s)');
      const findConnectInMenu = () => {
        const candidates = allEls().filter(el => {
          const isNew = !beforeEls.has(el);
          const becameVisible = !beforeVisible.has(el) && isVisible(el);
          if (!isNew && !becameVisible) return false;
          if (!isVisible(el)) return false;
          const text = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase().replace(/[^a-z ]/g, '').trim();
          if (text === 'connect') return true;
          const label = (el.getAttribute('aria-label') || '').toLowerCase();
          const href = (el.getAttribute('href') || '').toLowerCase();
          return label.startsWith('connect') || label.includes('invite') || href.includes('invite');
        });
        if (!candidates.length) return null;
        // Several nested ancestors of the item can all satisfy the text
        // match (the row div, its text span, etc.) — the one with the
        // fewest descendant elements is the tightest wrapper, closest to
        // what a real click would land on.
        candidates.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
        return candidates[0];
      };

      let conn = null;
      const menuDeadline = Date.now() + 5000;
      while (Date.now() < menuDeadline) {
        conn = findConnectInMenu();
        if (conn) break;
        await sleep(200);
      }
      if (!conn) { LOG('ERROR: Connect not found in dropdown'); return; }
      conn.click();
      await sleep(1000);
    }

    LOG('Polling for "Add a note" (up to 10s)');
    let addNote = null;
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      addNote = findAddNote();
      if (addNote) break;
      await sleep(200);
    }
    if (addNote) {
      addNote.click();
      const taDeadline = Date.now() + 5000;
      while (Date.now() < taDeadline) { if (deepQ('textarea')) break; await sleep(200); }
    }

    const ta = deepQ('textarea');
    if (ta) {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(ta, message);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
      LOG('Textarea filled');
    } else {
      LOG('ERROR: no textarea — modal may not have opened');
    }
    })();

    return 'STARTED';
  })();`;
}

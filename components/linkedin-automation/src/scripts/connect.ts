/**
 * Generates a self-contained IIFE that runs inside a LinkedIn profile page.
 * Finds the Connect button (direct or via More dropdown), clicks it, waits for
 * the modal, clicks "Add a note", and fills the textarea with the given message.
 *
 * Pure function — no I/O, safe to unit test.
 */
export function generateConnectScript(message: string): string {
  return `(async function() {
    const LOG = msg => console.log('[CC] ' + msg);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const message = ${JSON.stringify(message)};
    LOG('Connect script injected. Message: ' + message.slice(0, 40) + '…');

    const isPending = Array.from(document.querySelectorAll('button'))
      .some(b => (b.innerText || '').trim().toLowerCase() === 'pending');
    if (isPending) { LOG('Skipping — already pending'); return; }

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

    const directConnect = Array.from(topCard.querySelectorAll('button, a')).find(b => {
      const label = (b.getAttribute('aria-label') || '').toLowerCase();
      const text = (b.innerText || '').toLowerCase().replace(/[^a-z ]/g, '').trim();
      return label.startsWith('invite ') || text === 'connect';
    });

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
            return label === 'more' || text === '...' || text === '…';
          }) || null;
      }
      if (!moreBtn) { LOG('ERROR: no Connect or More button found'); return; }
      moreBtn.click();
      await sleep(2000);

      const conn = Array.from(document.querySelectorAll('a[role="menuitem"]')).find(el => {
        const text = (el.innerText || '').replace(/\\s+/g, ' ').trim().toLowerCase();
        const label = (el.getAttribute('aria-label') || '').toLowerCase();
        const href = (el.getAttribute('href') || '').toLowerCase();
        return text === 'connect' || label.includes('invite') || href.includes('invite');
      });
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
  })();`;
}

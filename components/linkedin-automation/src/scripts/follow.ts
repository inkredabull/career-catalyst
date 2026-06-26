/**
 * Generates a self-contained IIFE that runs inside a LinkedIn company page.
 * Finds and clicks the Follow button if not already following.
 *
 * Pure function — no I/O, safe to unit test.
 */
export function generateFollowScript(): string {
  return `(async function() {
    const LOG = msg => console.log('[CC] ' + msg);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    LOG('Follow script injected');

    // Poll up to 8s for the page hero to render
    const deadline = Date.now() + 8000;
    let followBtn = null;
    while (Date.now() < deadline) {
      followBtn = Array.from(document.querySelectorAll('button')).find(b => {
        const label = (b.getAttribute('aria-label') || '').toLowerCase();
        const text = (b.innerText || b.textContent || '').trim().toLowerCase();
        return label === 'follow' || text === 'follow';
      });
      if (followBtn) break;
      await sleep(300);
    }

    if (!followBtn) { LOG('ERROR: Follow button not found after 8s'); return; }

    const alreadyFollowing = Array.from(document.querySelectorAll('button')).some(b => {
      const text = (b.innerText || b.textContent || '').trim().toLowerCase();
      return text === 'following';
    });
    if (alreadyFollowing) { LOG('Already following — skipping'); return; }

    followBtn.click();
    LOG('Follow button clicked');
  })();`;
}

'use strict';

// Ephemeral in-memory store backing the Morning Warmup digest's short /n/<id> LinkedIn links.
// mail-merge registers {url, message, firstName} here ahead of time (at draft-creation time) so
// the digest email can carry a short id instead of the message text spelled out in a query
// string. Not persisted to disk on purpose: a server restart already invalidates any outstanding
// link anyway, since it changes the ngrok URL baked into it.

const NUDGE_TTL_MS = parseInt(process.env.WARMUP_NUDGE_TTL_MS || String(14 * 24 * 60 * 60 * 1000), 10);

let _store = new Map(); // id -> { url, message, firstName, expiresAt }

// Allow tests to inject a fresh Map instance.
function _setStore(map) { _store = map; }

function pruneExpired(now = Date.now()) {
  for (const [id, entry] of _store) {
    if (entry.expiresAt <= now) _store.delete(id);
  }
}

function registerNudge({ id, url, message, firstName }) {
  pruneExpired();
  _store.set(id, { url, message: message || '', firstName: firstName || '', expiresAt: Date.now() + NUDGE_TTL_MS });
}

function getNudge(id) {
  pruneExpired();
  return _store.get(id) || null;
}

// JSON.stringify safely escapes quotes/backslashes/newlines for embedding as a JS string literal,
// but not a literal "</script>" substring inside the value, which would otherwise close the tag
// early — escape that separately before embedding.
function escapeForScriptTag(s) {
  return JSON.stringify(s || '').replace(/<\/script/gi, '<\\/script');
}

function buildNudgeHtml({ url, message, firstName }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Opening LinkedIn…</title></head>
<body style="font-family:sans-serif;padding:32px">
  <p>Opening LinkedIn and preparing your message…</p>
  <p style="color:#888;font-size:13px">You'll be redirected automatically.</p>
  <script>
    // window.postMessage has no delivery guarantee for a listener that isn't registered yet, and
    // content.js (which attaches the CC_LI_MESSAGES listener) injects at document_end — there's no
    // guarantee that happens before this inline script runs during page parse. A single shot can
    // silently land before the listener exists and just vanish, with no ack to detect it. Resend
    // repeatedly over a window instead, so whenever content.js does attach, the next resend (not
    // just the first one) gets through before we navigate away.
    (function () {
      var payload = {
        type: 'CC_LI_MESSAGES',
        contacts: [{
          url: ${escapeForScriptTag(url)},
          message: ${escapeForScriptTag(message)},
          firstName: ${escapeForScriptTag(firstName)}
        }]
      };
      var attempts = 0;
      var maxAttempts = 10;
      var timer = setInterval(function () {
        window.postMessage(payload, '*');
        attempts++;
        if (attempts >= maxAttempts) {
          clearInterval(timer);
          location.href = ${escapeForScriptTag(url)};
        }
      }, 150);
    })();
  </script>
</body></html>`;
}

// ─── Express handlers ─────────────────────────────────────────────────────────

function registerNudgeHandler(req, res) {
  const { id, url, message, firstName } = req.body || {};
  if (!id || !url) {
    return res.status(400).json({ success: false, error: 'id and url are required' });
  }
  registerNudge({ id, url, message, firstName });
  res.json({ success: true });
}

function nudgeRedirectHandler(req, res) {
  const entry = getNudge(req.params.id);
  if (!entry) {
    return res.status(404).send('<p>This link has expired or is invalid.</p>');
  }
  res.send(buildNudgeHtml(entry));
}

module.exports = {
  registerNudgeHandler,
  nudgeRedirectHandler,
  registerNudge,
  getNudge,
  pruneExpired,
  buildNudgeHtml,
  _setStore,
};

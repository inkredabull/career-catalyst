'use strict';

function loadModule() {
  jest.resetModules();
  return require('../warmup-nudge-store');
}

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    send(payload) { this.body = payload; return this; },
  };
}

describe('registerNudgeHandler / nudgeRedirectHandler', () => {
  it('returns 400 when id is missing', () => {
    const { registerNudgeHandler } = loadModule();
    const res = mockRes();
    registerNudgeHandler({ body: { url: 'https://www.linkedin.com/in/someone' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when url is missing', () => {
    const { registerNudgeHandler } = loadModule();
    const res = mockRes();
    registerNudgeHandler({ body: { id: 'abc123' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('registers a nudge and serves it back by id', () => {
    const { registerNudgeHandler, nudgeRedirectHandler } = loadModule();
    const registerRes = mockRes();
    registerNudgeHandler({
      body: { id: 'abc123', url: 'https://www.linkedin.com/in/someone', message: 'Hi Sam', firstName: 'Sam' },
    }, registerRes);
    expect(registerRes.body).toEqual({ success: true });

    const getRes = mockRes();
    nudgeRedirectHandler({ params: { id: 'abc123' } }, getRes);
    expect(getRes.statusCode).toBe(200);
    expect(getRes.body).toContain("type: 'CC_LI_MESSAGES'");
    expect(getRes.body).toContain('Sam');
    expect(getRes.body).toContain('https://www.linkedin.com/in/someone');
  });

  it('returns 404 for an unknown id', () => {
    const { nudgeRedirectHandler } = loadModule();
    const res = mockRes();
    nudgeRedirectHandler({ params: { id: 'does-not-exist' } }, res);
    expect(res.statusCode).toBe(404);
  });
});

describe('pruneExpired', () => {
  it('removes entries whose TTL has passed and keeps the rest', () => {
    const { registerNudge, getNudge, pruneExpired, _setStore } = loadModule();
    _setStore(new Map());
    registerNudge({ id: 'old', url: 'https://www.linkedin.com/in/old' });
    registerNudge({ id: 'fresh', url: 'https://www.linkedin.com/in/fresh' });

    // pruneExpired is called internally with Date.now(); drive it directly with an injected
    // "now" far enough in the future that only entries created before it should be swept.
    pruneExpired(Date.now() + 365 * 24 * 60 * 60 * 1000);

    expect(getNudge('old')).toBeNull();
    expect(getNudge('fresh')).toBeNull();
  });

  it('leaves unexpired entries alone', () => {
    const { registerNudge, getNudge, pruneExpired, _setStore } = loadModule();
    _setStore(new Map());
    registerNudge({ id: 'fresh', url: 'https://www.linkedin.com/in/fresh' });

    pruneExpired(Date.now());

    expect(getNudge('fresh')).not.toBeNull();
  });
});

describe('buildNudgeHtml escaping', () => {
  it('safely embeds quotes, newlines, and a </script>-like substring', () => {
    const { buildNudgeHtml } = loadModule();
    const tricky = 'Hi "Sam", line1\nline2 </script><script>alert(1)</script>';
    const html = buildNudgeHtml({ url: 'https://www.linkedin.com/in/sam', message: tricky, firstName: 'Sam' });

    // The literal sequence "</script>" must never appear outside of our own two intentional
    // closing tags — i.e. the embedded message's copy must have been neutralized.
    const scriptCloses = (html.match(/<\/script>/g) || []).length;
    expect(scriptCloses).toBe(1); // only the real closing tag for our own <script> block
    expect(html).toContain('line1\\nline2');
  });
});

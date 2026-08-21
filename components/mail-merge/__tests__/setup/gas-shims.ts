// GAS global shims for Jest.
// Maps GAS runtime APIs to Node equivalents so production code runs unmodified in tests.

import syncFetch from 'sync-fetch';

// webpack DefinePlugin globals — src/config/env.ts reads these at module load, so they must
// exist before any test imports it. Read through to process.env so tests can point at a local server.
process.env.NGROK_TUNNEL_URL = process.env.NGROK_TUNNEL_URL ?? 'http://localhost:3000';
Object.defineProperty(global, '__NGROK_TUNNEL_URL__', {
  configurable: true,
  get: () => process.env.NGROK_TUNNEL_URL ?? '',
});

process.env.SMS_BRIDGE_SECRET = process.env.SMS_BRIDGE_SECRET ?? 'test-secret';
Object.defineProperty(global, '__SMS_BRIDGE_SECRET__', {
  configurable: true,
  get: () => process.env.SMS_BRIDGE_SECRET ?? '',
});

(global as unknown as Record<string, unknown>).UrlFetchApp = {
  fetch: (url: string, options: Record<string, unknown> = {}) => {
    const headers: Record<string, string> = { ...(options['headers'] as Record<string, string> ?? {}) };
    if (options['contentType']) headers['Content-Type'] = options['contentType'] as string;
    const res = syncFetch(url, {
      method: (options['method'] as string ?? 'GET').toUpperCase(),
      headers,
      body: options['payload'] as string | undefined,
    });
    const text = res.text();
    return {
      getResponseCode: () => res.status as number,
      getContentText: () => text as string,
    };
  },
};

(global as unknown as Record<string, unknown>).PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (key: string) => process.env[key] ?? null,
  }),
};

const _cache = new Map<string, string>();
(global as unknown as Record<string, unknown>).CacheService = {
  getScriptCache: () => ({
    get: (key: string) => _cache.get(key) ?? null,
    put: (key: string, value: string) => { _cache.set(key, value); },
    remove: (key: string) => { _cache.delete(key); },
  }),
};

(global as unknown as Record<string, unknown>).Logger = {
  log: (msg: string, ...args: unknown[]) => console.log(msg, ...args),
};

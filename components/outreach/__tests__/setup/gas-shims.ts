// GAS global shims for Jest.
// Maps GAS runtime APIs to Node equivalents so production code runs unmodified in tests.

import syncFetch from 'sync-fetch';

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

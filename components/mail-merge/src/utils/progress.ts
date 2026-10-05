// Per-user rolling progress log, surfaced to progress dialogs via polling since GAS has no
// server push. Always records what's pushed — independent of the LOG_LEVEL-gated logger — so the
// dialog shows full detail without any Script Property configuration.
//
// `scope` namespaces the cache key per dialog (e.g. 'send', 'lookup') so two dialogs running
// close together don't read each other's leftover progress lines out of the shared user cache.

const CACHE_KEY_PREFIX = 'MAILMERGE_SEND_PROGRESS:';
const MAX_LINES = 300;
const TTL_SECONDS = 1800;

export const clearProgress = (scope: string): void => {
  CacheService.getUserCache().remove(CACHE_KEY_PREFIX + scope);
};

export const pushProgress = (scope: string, line: string): void => {
  const cache = CacheService.getUserCache();
  const key = CACHE_KEY_PREFIX + scope;
  const existing = JSON.parse(cache.get(key) ?? '[]') as string[];
  existing.push(line);
  const trimmed = existing.length > MAX_LINES ? existing.slice(-MAX_LINES) : existing;
  cache.put(key, JSON.stringify(trimmed), TTL_SECONDS);
};

export const getSendProgress = (scope: string): string[] => {
  const cached = CacheService.getUserCache().get(CACHE_KEY_PREFIX + scope);
  return cached ? (JSON.parse(cached) as string[]) : [];
};

/** Write to both Cloud Logging and the progress cache so the dialog sees it. */
export const logAndPush = (scope: string, msg: string): void => {
  console.log(msg);
  pushProgress(scope, msg);
};

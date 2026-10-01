// Per-user rolling progress log, surfaced to the "Sending emails" dialog via polling since GAS
// has no server push. Always records what's pushed — independent of the LOG_LEVEL-gated logger —
// so the dialog shows full detail without any Script Property configuration.

const CACHE_KEY = 'MAILMERGE_SEND_PROGRESS';
const MAX_LINES = 300;
const TTL_SECONDS = 1800;

export const clearProgress = (): void => {
  CacheService.getUserCache().remove(CACHE_KEY);
};

export const pushProgress = (line: string): void => {
  const cache = CacheService.getUserCache();
  const existing = JSON.parse(cache.get(CACHE_KEY) ?? '[]') as string[];
  existing.push(line);
  const trimmed = existing.length > MAX_LINES ? existing.slice(-MAX_LINES) : existing;
  cache.put(CACHE_KEY, JSON.stringify(trimmed), TTL_SECONDS);
};

export const getSendProgress = (): string[] => {
  const cached = CacheService.getUserCache().get(CACHE_KEY);
  return cached ? (JSON.parse(cached) as string[]) : [];
};

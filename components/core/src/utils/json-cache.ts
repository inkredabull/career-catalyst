import * as fs from 'fs';
import * as path from 'path';

export interface CachedOrGenerated<T> {
  value: T;
  fromCache: boolean;
}

/**
 * Loads a JSON value from `cachePath` if it exists; otherwise calls `generate()`,
 * persists the result to `cachePath`, and returns it. Free of cost/logging concerns
 * so callers can brand their own console output around the `fromCache` flag.
 */
export async function loadOrGenerate<T>(
  cachePath: string,
  generate: () => Promise<T>
): Promise<CachedOrGenerated<T>> {
  if (fs.existsSync(cachePath)) {
    const value = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as T;
    return { value, fromCache: true };
  }

  const value = await generate();
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(value, null, 2));
  return { value, fromCache: false };
}

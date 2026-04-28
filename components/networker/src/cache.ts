/**
 * File-based JSON cache for discovered profiles.
 * Ported from meetup-networker/cache.ts — updated to use DiscoveredProfile.
 *
 * Structure:  logs/<event-slug>/<first-last>.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { DiscoveredProfile } from './types.js';

const CACHE_DIR = 'logs';

function normalizeEventName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
}

function ensureCacheDir(eventName: string): void {
  const dir = join(CACHE_DIR, normalizeEventName(eventName));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function cacheKey(firstName: string, lastName: string): string {
  return `${firstName}-${lastName}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-') + '.json';
}

export function getCachedLookup(
  firstName: string,
  lastName: string,
  eventName: string
): DiscoveredProfile | null {
  ensureCacheDir(eventName);
  if (!existsSync(CACHE_DIR)) return null;

  const key = cacheKey(firstName, lastName);
  try {
    const dirs = readdirSync(CACHE_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const dir of dirs) {
      const file = join(CACHE_DIR, dir, key);
      if (existsSync(file)) {
        try {
          const { cachedAt: _ca, ...profile } = JSON.parse(readFileSync(file, 'utf-8'));
          return profile as DiscoveredProfile;
        } catch { continue; }
      }
    }
  } catch {
    console.warn(`  Warning: could not search cache for ${firstName} ${lastName}`);
  }
  return null;
}

export function saveLookupToCache(
  firstName: string,
  lastName: string,
  profile: DiscoveredProfile,
  eventName: string
): void {
  ensureCacheDir(eventName);
  const file = join(CACHE_DIR, normalizeEventName(eventName), cacheKey(firstName, lastName));
  try {
    writeFileSync(file, JSON.stringify({ ...profile, cachedAt: new Date().toISOString() }, null, 2), 'utf-8');
  } catch {
    console.warn(`  Warning: could not save cache for ${firstName} ${lastName}`);
  }
}

export function markConnectionSent(
  firstName: string,
  lastName: string,
  eventName: string
): void {
  const slug = normalizeEventName(eventName);
  const candidates = [join(CACHE_DIR, slug), join(CACHE_DIR, `${slug}-csv`)];
  const key = cacheKey(firstName, lastName);

  for (const dir of candidates) {
    const file = join(dir, key);
    if (existsSync(file)) {
      try {
        const data = JSON.parse(readFileSync(file, 'utf-8'));
        data.connectionSent = true;
        writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
      } catch {
        console.warn(`  Warning: could not mark connectionSent for ${firstName} ${lastName}`);
      }
      return;
    }
  }
}

export function loadAllCachedProfiles(eventName: string): DiscoveredProfile[] {
  const slug = normalizeEventName(eventName);
  const candidates = [join(CACHE_DIR, slug), join(CACHE_DIR, `${slug}-csv`)];

  for (const dir of candidates) {
    if (!existsSync(dir)) continue;
    try {
      return readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .flatMap(f => {
          try {
            const { cachedAt: _ca, ...profile } = JSON.parse(readFileSync(join(dir, f), 'utf-8'));
            return [profile as DiscoveredProfile];
          } catch { return []; }
        });
    } catch { continue; }
  }
  return [];
}

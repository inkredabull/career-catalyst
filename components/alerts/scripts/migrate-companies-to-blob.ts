/**
 * One-time migration: merges COMPANIES_TO_EXCLUDE (formerly in constants.ts) into
 * the blob-backed company stop list.
 *
 * Run from components/alerts/: npx ts-node scripts/migrate-companies-to-blob.ts
 * Requires BLOB_READ_WRITE_TOKEN in .env.local (run `vercel env pull .env.local` first).
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

import { put, list, del } from '@vercel/blob';
import { loadStopLists } from '../src/seen';

const COMPANIES_TO_MIGRATE = [
  'Airwallex',
  'Harnham',
  'CyberCoders',
  '80Twenty',
  'Lumicity',
  'Jobot',
  'Recruiting from Scratch',
  'Jobs via eFinancialCareers',
  'Health eCareers',
  'Acceler8 Talent',
  'Storm4',
  'myGwork - LGBTQ+ Business Community',
  'Stealth',
  'Storm6',
  'Dice',
  'Get It Recruit - Information Technology',
  'CryptoRecruit',
  'Crossover',
  'Gusto',
  'Confidential',
  'Jobs via Dice',
  'Rad AI',
  'Stealth Startup',
];

const STOP_LISTS_PATH = 'alerts/stop-lists.json';

async function main(): Promise<void> {
  const current = await loadStopLists();
  const existing = new Set(current.companies.map(c => c.toLowerCase()));
  const toAdd = COMPANIES_TO_MIGRATE.filter(c => !existing.has(c.toLowerCase()));

  if (toAdd.length === 0) {
    console.log('All companies already in stop list — nothing to do.');
    return;
  }

  const updated = { ...current, companies: [...current.companies, ...toAdd] };
  const { blobs } = await list({ prefix: STOP_LISTS_PATH, limit: 1 });
  if (blobs.length > 0) await del(blobs[0].url);
  await put(STOP_LISTS_PATH, JSON.stringify(updated), { access: 'private', addRandomSuffix: false });

  console.log(`Added ${toAdd.length} companies to stop list:`);
  toAdd.forEach(c => console.log(`  + ${c}`));
}

main().catch(err => { console.error(err); process.exit(1); });

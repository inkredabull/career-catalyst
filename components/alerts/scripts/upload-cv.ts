/**
 * One-time setup: uploads cv.txt from the repo root to Vercel Blob as alerts/cv.txt.
 * Run with: npx dotenv -e .env.local -- npx ts-node scripts/upload-cv.ts
 * Requires BLOB_READ_WRITE_TOKEN in .env.local (run `vercel env pull .env.local` first).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { put } from '@vercel/blob';

async function main(): Promise<void> {
  const cvPath = resolve(__dirname, '../../../cv.txt');
  const cv = readFileSync(cvPath, 'utf8');

  console.log(`Uploading cv.txt (${cv.length} chars) to Vercel Blob...`);
  const blob = await put('alerts/cv.txt', cv, {
    access: 'public',
    addRandomSuffix: false,
  });
  console.log(`Done: ${blob.url}`);
}

main().catch(err => { console.error(err); process.exit(1); });

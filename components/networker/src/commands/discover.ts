/**
 * discover command — name list → EnrichLayer profile lookup → tier-ranked results.
 * Ported from meetup-networker index.ts (review/lookup path).
 *
 * Usage: networker discover <file> [--batch-size N]
 */

import { readFileSync, writeFileSync } from 'fs';
import { Command } from 'commander';
import { parseNameList } from '../nameParser.js';
import { parseEventFromFileName } from '../eventParser.js';
import { lookupProfiles, getCreditBalance } from '../services/profileLookup.js';
import { loadAllCachedProfiles } from '../cache.js';
import { BATCH } from '../config.js';

function clampBatchSize(input?: string): number {
  const n = input ? parseInt(input, 10) : BATCH.DEFAULT_SIZE;
  const size = isNaN(n) || n <= 0 ? BATCH.DEFAULT_SIZE : n;
  if (size < BATCH.MIN_SIZE) { console.log(`Batch size below ${BATCH.MIN_SIZE}; using ${BATCH.MIN_SIZE}.`); return BATCH.MIN_SIZE; }
  if (size > BATCH.MAX_SIZE) { console.log(`Batch size above ${BATCH.MAX_SIZE}; using ${BATCH.MAX_SIZE}.`); return BATCH.MAX_SIZE; }
  return size;
}

export function registerDiscover(program: Command): void {
  program
    .command('discover <file>')
    .description('Look up LinkedIn profiles for a list of names (one per line)')
    .option('--batch-size <n>', 'Names to process per run (clamped to 10–15)')
    .action(async (filePath: string, opts: { batchSize?: string }) => {
      const batchSize = clampBatchSize(opts.batchSize ?? process.env.BATCH_SIZE);
      const eventInfo = parseEventFromFileName(filePath);

      console.log(`Event:      ${eventInfo.eventName}`);
      console.log(`File:       ${filePath}`);
      console.log(`Batch size: ${batchSize}\n`);

      const content = readFileSync(filePath, 'utf-8');
      const parsedNames = parseNameList(content);

      let profiles;

      if (parsedNames.length === 0) {
        console.log('File is empty — loading cached target contacts…\n');
        const cached = loadAllCachedProfiles(eventInfo.eventName);
        profiles = cached.filter(p => p.isTargetContact && !p.error);
        if (profiles.length === 0) {
          console.log('No cached target contacts found for this event.');
          return;
        }
        console.log(`Found ${profiles.length} cached target contact(s)\n`);
      } else {
        const batch = parsedNames.slice(0, batchSize);
        const remaining = parsedNames.slice(batchSize);

        console.log(`Processing ${batch.length} names in this batch`);
        if (remaining.length > 0) console.log(`${remaining.length} names will remain for next batch`);
        console.log('');

        const before = await getCreditBalance();
        if (before != null) console.log(`Credit balance before: ${before}\n`);

        console.log('Looking up LinkedIn profiles…\n');
        profiles = await lookupProfiles(batch, eventInfo.eventName);

        const after = await getCreditBalance();
        if (after != null) {
          console.log(`Credit balance after: ${after}`);
          if (before != null) console.log(`Cost: ${before - after} credits used`);
        }
        console.log('');

        // Trim processed names from file
        const remainingContent = remaining.map(n => n.original).join('\n') + (remaining.length ? '\n' : '');
        writeFileSync(filePath, remainingContent, 'utf-8');
        if (remaining.length > 0) {
          console.log(`📝 File updated — ${remaining.length} names remaining. Run again for next batch.\n`);
        } else {
          console.log('🎉 All names processed. File cleared.\n');
        }
      }

      // Display results
      const targets = profiles.filter(p => p.isTargetContact);
      console.log(`=== ${eventInfo.eventName} — Results ===\n`);

      profiles.forEach((p, i) => {
        const tier = p.isTargetContact ? ` [⭐ ${p.priorityTier ?? 'TARGET'}]` : '';
        console.log(`${i + 1}. ${p.name}${tier}`);
        if (p.error) {
          console.log(`   Error: ${p.error}`);
        } else {
          console.log(`   Title:    ${p.currentTitle ?? 'N/A'}`);
          if (p.currentCompany) console.log(`   Company:  ${p.currentCompany}`);
          console.log(`   Location: ${p.location ?? 'N/A'}`);
          if (p.condensedSummary) console.log(`   Summary:  ${p.condensedSummary}`);
          if (p.linkedInUrl) console.log(`   LinkedIn: ${p.linkedInUrl}`);
          console.log(`   Status:   ${p.isTargetContact ? `✅ REVIEW — ${p.priorityTier}` : '⏭️  SKIP'}`);
        }
        console.log('');
      });

      const t1 = targets.filter(p => p.priorityTier === 'TIER_1').length;
      const t2 = targets.filter(p => p.priorityTier === 'TIER_2').length;
      const t3 = targets.filter(p => p.priorityTier === 'TIER_3').length;
      console.log(`Profiles: ${profiles.length}  |  Targets: ${targets.length}  |  T1=${t1} T2=${t2} T3=${t3}`);
      console.log(`\nTo send invites: networker send ${filePath} --send-tier tier_1`);
    });
}

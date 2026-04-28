/**
 * send command — open Chrome tabs for target contacts and inject connect modals.
 * Ported from meetup-networker index.ts (--send path).
 *
 * Usage: networker send <file> [--send-tier tier_1] [--max-sends N]
 */

import { execSync } from 'child_process';
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { parseEventFromFileName } from '../eventParser.js';
import { loadAllCachedProfiles, markConnectionSent } from '../cache.js';
import { openMessageModal, getChromeFrontWindowTabCount } from '../services/linkedin.js';
import { DiscoveredProfile, ContactPriorityTier } from '../types.js';
import { BATCH } from '../config.js';

function normalizeTier(input?: string): ContactPriorityTier {
  if (!input || input.toLowerCase() === 'all') return 'NONE';
  const t = input.toUpperCase().replace('-', '_');
  if (t === 'TIER_1' || t === 'TIER_2' || t === 'TIER_3') return t;
  throw new Error(`Invalid --send-tier "${input}". Use: tier_1, tier_2, tier_3, or all`);
}

function tierRank(tier?: ContactPriorityTier): number {
  if (tier === 'TIER_1') return 1;
  if (tier === 'TIER_2') return 2;
  if (tier === 'TIER_3') return 3;
  return 99;
}

function isTierSelected(profileTier: ContactPriorityTier | undefined, sendTier: ContactPriorityTier): boolean {
  if (!profileTier || profileTier === 'NONE') return false;
  return sendTier === 'NONE' ? true : profileTier === sendTier;
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function randomDelay(min: number, max: number): Promise<void> {
  return delay(Math.floor(Math.random() * (max - min + 1)) + min);
}

export function registerSend(program: Command): void {
  program
    .command('send <file>')
    .description('Open Chrome tabs and inject connect modals for cached target contacts')
    .option('--send-tier <tier>', 'Tier to target: tier_1, tier_2, tier_3, or all', 'tier_1')
    .option('--max-sends <n>', 'Max profiles to send in one run', `${BATCH.DEFAULT_MAX_SENDS}`)
    .action(async (filePath: string, opts: { sendTier?: string; maxSends?: string }) => {
      const sendTier = normalizeTier(opts.sendTier);
      const maxSends = parseInt(opts.maxSends ?? `${BATCH.DEFAULT_MAX_SENDS}`, 10);
      const eventInfo = parseEventFromFileName(filePath);

      console.log(`Event:     ${eventInfo.eventName}`);
      console.log(`Send tier: ${sendTier === 'NONE' ? 'ALL' : sendTier}`);
      console.log(`Max sends: ${maxSends}\n`);

      // Load from cache (discover must have been run first)
      let profiles: DiscoveredProfile[];
      try {
        readFileSync(filePath, 'utf-8'); // confirm file exists
        profiles = loadAllCachedProfiles(eventInfo.eventName);
      } catch {
        console.error(`Cannot read file: ${filePath}`);
        process.exit(1);
      }

      const targets = profiles.filter(p => p.isTargetContact && !p.error);

      const alreadySent = targets.filter(p => p.connectionSent).length;
      if (alreadySent > 0) console.log(`Skipping ${alreadySent} already-sent connection(s)`);

      const candidates = targets
        .filter(p => p.linkedInUrl && isTierSelected(p.priorityTier, sendTier) && !p.connectionSent)
        .sort((a, b) => tierRank(a.priorityTier) - tierRank(b.priorityTier))
        .slice(0, maxSends);

      if (candidates.length === 0) {
        console.log(`No send candidates for tier ${sendTier === 'NONE' ? 'ALL' : sendTier}.`);
        return;
      }

      console.log(`Opening ${candidates.length} LinkedIn profile(s) in Chrome…`);
      const startTabCount = getChromeFrontWindowTabCount();

      for (let i = 0; i < candidates.length; i++) {
        execSync(`open -a "Google Chrome" "${candidates[i].linkedInUrl}"`, { stdio: 'ignore' });
        console.log(`  Opened: ${candidates[i].name}`);
        if (i < candidates.length - 1) await randomDelay(1600, 3750);
      }

      console.log('\nWaiting 4s for pages to load…');
      await delay(4000);

      console.log('\nOpening message modals…\n');
      for (let i = 0; i < candidates.length; i++) {
        const profile = candidates[i];
        const tabIndex = startTabCount + i + 1;
        await openMessageModal(profile, tabIndex, eventInfo.eventName);

        const nameParts = profile.name.trim().split(/\s+/);
        markConnectionSent(
          profile.firstName ?? nameParts[0] ?? '',
          nameParts[nameParts.length - 1] ?? '',
          eventInfo.eventName
        );
        console.log(`  Marked ${profile.name} as connection sent`);
        if (i < candidates.length - 1) await randomDelay(800, 1500);
      }

      console.log('\n✅ Message modals populated. Review and send each when ready.');
    });
}

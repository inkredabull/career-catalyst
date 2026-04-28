/**
 * reinvite command — open Chrome tabs for re-invite candidates and inject connect modals.
 * New command: combines review output with the AppleScript injection from meetup-networker.
 *
 * Usage: networker reinvite [--max-sends N] [--dry-run]
 */

import { execSync } from 'child_process';
import { Command } from 'commander';
import { runMonthlyReview, markAsReInvited } from '../services/tracker.js';
import { openMessageModal, getChromeFrontWindowTabCount } from '../services/linkedin.js';
import { BATCH } from '../config.js';
import { DiscoveredProfile } from '../types.js';

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function randomDelay(min: number, max: number): Promise<void> {
  return delay(Math.floor(Math.random() * (max - min + 1)) + min);
}

export function registerReinvite(program: Command): void {
  program
    .command('reinvite')
    .description('Open Chrome tabs for re-invite candidates and populate connect modals')
    .option('--max-sends <n>', 'Max re-invites to send in one run', `${BATCH.DEFAULT_MAX_SENDS}`)
    .option('--dry-run', 'Preview what would be sent without opening Chrome', false)
    .action(async (opts: { maxSends?: string; dryRun?: boolean }) => {
      const maxSends = parseInt(opts.maxSends ?? `${BATCH.DEFAULT_MAX_SENDS}`, 10);
      const dryRun = Boolean(opts.dryRun);

      const { toReInvite } = runMonthlyReview();

      if (toReInvite.length === 0) {
        console.log('✅ No re-invite candidates today.');
        return;
      }

      const candidates = toReInvite.slice(0, maxSends);

      console.log(`Re-invite candidates: ${toReInvite.length} total, sending ${candidates.length}`);
      if (dryRun) console.log('(DRY RUN — no Chrome tabs will be opened)\n');
      console.log('');

      for (const { contact, messageToSend, attemptNumber } of candidates) {
        console.log(`  • [#${contact.id}] ${contact.name} — attempt ${attemptNumber} of 2`);
        console.log(`        ${contact.linkedInUrl}`);
        console.log(`        "${messageToSend.slice(0, 80)}${messageToSend.length > 80 ? '…' : ''}"`);
      }

      if (dryRun) {
        console.log('\nDry run complete — no changes made.');
        return;
      }

      console.log(`\nOpening ${candidates.length} LinkedIn profile(s) in Chrome…`);
      const startTabCount = getChromeFrontWindowTabCount();

      for (let i = 0; i < candidates.length; i++) {
        const { contact } = candidates[i];
        if (!contact.linkedInUrl) {
          console.log(`  ⚠️  Skipping ${contact.name} — no LinkedIn URL`);
          continue;
        }
        execSync(`open -a "Google Chrome" "${contact.linkedInUrl}"`, { stdio: 'ignore' });
        console.log(`  Opened: ${contact.name}`);
        if (i < candidates.length - 1) await randomDelay(1600, 3750);
      }

      console.log('\nWaiting 4s for pages to load…');
      await delay(4000);

      console.log('\nOpening message modals…\n');
      for (let i = 0; i < candidates.length; i++) {
        const { contact, messageToSend } = candidates[i];
        if (!contact.linkedInUrl) continue;

        const tabIndex = startTabCount + i + 1;

        // Build a minimal DiscoveredProfile shape for openMessageModal
        const profileShim: DiscoveredProfile = {
          name: contact.name,
          linkedInUrl: contact.linkedInUrl,
        };

        await openMessageModal(profileShim, tabIndex, '', messageToSend);

        // Update tracker status
        if (markAsReInvited(contact.id)) {
          console.log(`  ✅ Marked #${contact.id} ${contact.name} as re-invited`);
        } else {
          console.log(`  ⚠️  Could not update status for #${contact.id} ${contact.name}`);
        }

        if (i < candidates.length - 1) await randomDelay(800, 1500);
      }

      console.log('\n✅ Modals populated. Review each tab and click Send when ready.');
    });
}

/**
 * review command — show contacts due for withdrawal and re-invite.
 * Ported from network-followups previewMonthlyReview / runMonthlyReview.
 *
 * Usage: networker review
 */

import { Command } from 'commander';
import { runMonthlyReview } from '../services/tracker.js';

export function registerReview(program: Command): void {
  program
    .command('review')
    .description('Show contacts due for withdrawal and re-invite (dry run — no changes made)')
    .action(() => {
      const { toWithdraw, toReInvite } = runMonthlyReview();

      if (toWithdraw.length === 0 && toReInvite.length === 0) {
        console.log('✅ Nothing to action today — all contacts are up to date.');
        return;
      }

      if (toWithdraw.length > 0) {
        console.log(`\nWITHDRAW (${toWithdraw.length}) — invitations older than 30 days`);
        console.log('─'.repeat(55));
        for (const { contact, daysSinceSent } of toWithdraw) {
          console.log(`  • [#${contact.id}] ${contact.name} (${daysSinceSent}d ago)`);
          if (contact.linkedInUrl) console.log(`        ${contact.linkedInUrl}`);
          console.log(`        "${contact.originalMessage.slice(0, 80)}${contact.originalMessage.length > 80 ? '…' : ''}"`);
        }
      }

      if (toReInvite.length > 0) {
        console.log(`\nRE-INVITE (${toReInvite.length}) — cooldown elapsed, variants ready`);
        console.log('─'.repeat(55));
        for (const { contact, messageToSend, attemptNumber } of toReInvite) {
          console.log(`  • [#${contact.id}] ${contact.name} — attempt ${attemptNumber} of 2`);
          if (contact.linkedInUrl) console.log(`        ${contact.linkedInUrl}`);
          console.log(`        "${messageToSend.slice(0, 80)}${messageToSend.length > 80 ? '…' : ''}"`);
        }
      }

      console.log('');
      if (toWithdraw.length > 0) {
        console.log(`Withdraw manually on LinkedIn, then run:`);
        const ids = toWithdraw.map(w => w.contact.id).join(',');
        console.log(`  networker mark-withdrawn ${ids}`);
      }
      if (toReInvite.length > 0) {
        console.log(`\nTo send re-invites: networker reinvite`);
      }
    });
}

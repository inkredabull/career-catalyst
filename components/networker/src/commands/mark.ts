/**
 * mark-withdrawn and mark-complete commands — manual status updates.
 *
 * Usage:
 *   networker mark-withdrawn 3,7,12
 *   networker mark-complete 5
 */

import { Command } from 'commander';
import { markAsWithdrawn, markAsComplete, getContact } from '../services/tracker.js';

function parseIds(raw: string): number[] {
  return raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
}

export function registerMark(program: Command): void {
  program
    .command('mark-withdrawn <ids>')
    .description('Mark contact IDs as withdrawn (comma-separated, e.g. 3,7,12)')
    .action((raw: string) => {
      const ids = parseIds(raw);
      let count = 0;
      for (const id of ids) {
        const contact = getContact(id);
        if (!contact) { console.log(`  ⚠️  ID ${id} not found`); continue; }
        if (markAsWithdrawn(id)) {
          console.log(`  ✅ #${id} ${contact.name} → WITHDRAWN`);
          count++;
        } else {
          console.log(`  ⚠️  #${id} ${contact.name} — status not eligible for withdrawal (current: ${contact.status})`);
        }
      }
      console.log(`\nUpdated ${count}/${ids.length} contact(s).`);
    });

  program
    .command('mark-complete <ids>')
    .description('Mark contact IDs as complete (comma-separated)')
    .action((raw: string) => {
      const ids = parseIds(raw);
      let count = 0;
      for (const id of ids) {
        const contact = getContact(id);
        if (!contact) { console.log(`  ⚠️  ID ${id} not found`); continue; }
        if (markAsComplete(id)) {
          console.log(`  ✅ #${id} ${contact.name} → COMPLETE`);
          count++;
        } else {
          console.log(`  ⚠️  #${id} ${contact.name} — could not update`);
        }
      }
      console.log(`\nUpdated ${count}/${ids.length} contact(s).`);
    });
}

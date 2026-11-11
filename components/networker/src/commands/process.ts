/**
 * process command: capture + discover loop.
 *   networker process <url>        capture the event, then run discover batches until the file is empty
 *   networker process <file.csv>   skip capture and resume an existing names file
 *
 * Between batches it pauses (Enter = next batch, q = stop) so results can be reviewed
 * and EnrichLayer credits are not burned unattended. Use --no-pause to run straight through.
 */

import { Command } from 'commander';
import { createInterface } from 'readline/promises';
import { readFileSync } from 'fs';
import { captureEvent, CaptureOptions } from './capture.js';
import { runDiscover } from './discover.js';
import { parseNameList } from '../nameParser.js';

interface ProcessOptions extends CaptureOptions {
  batchSize?: string;
  pause?: boolean; // --no-pause sets false
}

const isUrl = (s: string) => /^https?:\/\//i.test(s);

export async function runProcess(target: string, opts: ProcessOptions): Promise<void> {
  const filePath = isUrl(target) ? (await captureEvent(target, opts)).filePath : target;

  let batch = 0;
  for (;;) {
    const left = parseNameList(readFileSync(filePath, 'utf-8')).length;
    if (left === 0) {
      console.log(batch === 0 ? 'Nothing to process: the names file has no usable names.' : '\nAll batches complete.');
      return;
    }

    batch++;
    console.log(`\n===== Batch ${batch} (${left} names remaining) =====\n`);
    const res = await runDiscover(filePath, { batchSize: opts.batchSize });
    if (res.aborted) {
      console.log(`\nStopped. Resume later with: npm run process -- "${filePath}"`);
      process.exitCode = 1;
      return;
    }
    if (res.remaining === 0) {
      console.log('\nAll batches complete. Next: npm run dev -- send "' + filePath + '" --send-tier tier_1');
      return;
    }

    if (opts.pause !== false) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = (await rl.question(`\n${res.remaining} names left. Enter = next batch, q = stop: `)).trim().toLowerCase();
      rl.close();
      if (answer === 'q') {
        console.log(`Stopped. Resume later with: npm run process -- "${filePath}"`);
        return;
      }
    }
  }
}

export function registerProcess(program: Command): void {
  program
    .command('process <urlOrFile>')
    .description('Capture an event from a Luma/Partiful URL (or resume a names file) and run discover until finished')
    .option('--batch-size <n>', 'Names per discover batch (clamped to 10-15)')
    .option('--out-dir <dir>', 'Where to write the names file', 'data/lists')
    .option('--no-sheet', 'Skip creating the Google Sheet tab')
    .option('--no-reminder', 'Skip creating the Reminder')
    .option('--keep-sheet', 'Keep the Google Sheet tab instead of deleting it after the CSV is saved')
    .option('--no-pause', 'Do not pause between discover batches')
    .action(async (target: string, opts: ProcessOptions) => {
      try {
        await runProcess(target, opts);
      } catch (err) {
        console.error(`\nProcess failed: ${err instanceof Error ? err.message : err}`);
        process.exitCode = 1;
      }
    });
}

#!/usr/bin/env node
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { Command } from 'commander';
import { extractSpreadsheetId } from '@inkredabull/career-catalyst-core';
import { contactsToJson } from './adapters/google-contacts';
import { WarmupOrchestrator } from './orchestrator';
import { WarmupSheetService } from './data/sheet-service';
import { buildDigestEmail } from './notifications/digest';
import { WARMUP_SHEET_NAME } from './config';

const program = new Command();

program
  .name('warmup-agent')
  .description('ReachPilot — self-directing network warmup agent')
  .version('0.3.0');

program
  .command('sync-contacts')
  .description('Export Google Contacts to JSON (mirrors mail-merge label exclusions)')
  .option('-o, --output <path>', 'Output JSON path', 'contacts.json')
  .option('--exclude-label-prefix <prefix>', 'Exclude contacts with matching label prefix', collect, [])
  .option('--exclude-email <email>', 'Exclude specific email', collect, [])
  .action(async options => {
    const orchestrator = new WarmupOrchestrator();
    const contacts = await orchestrator.syncContacts({
      excludedLabelPrefixes: options.excludeLabelPrefix,
      excludedEmails: options.excludeEmail,
    });

    writeFileSync(options.output, contactsToJson(contacts));
    console.log(`✅ Exported ${contacts.length} contacts to ${options.output}`);
  });

program
  .command('plan')
  .description('Plan phase: score contacts, assign enrichment + subject variants')
  .option('-c, --contacts <path>', 'JSON file with contact pool')
  .option('--from-google', 'Load contacts from Google People API', false)
  .option('-s, --sheet <url>', 'Google Sheet URL for Warmup History tab')
  .option('-n, --count <number>', 'Contacts to select', '5')
  .option('-o, --output <path>', 'Write run-spec.json to path')
  .option('--dry-run', 'Plan only — do not write to sheet', false)
  .option('--exclude-label-prefix <prefix>', 'Exclude contacts with matching label prefix', collect, [])
  .option('--exclude-email <email>', 'Exclude specific email', collect, [])
  .action(async options => {
    const contactsJson = options.contacts
      ? readFileSync(options.contacts, 'utf-8')
      : undefined;

    const orchestrator = new WarmupOrchestrator();
    const result = await orchestrator.planPhase({
      contactsJson,
      useGoogleContacts: options.fromGoogle,
      spreadsheetUrl: options.sheet ?? process.env.WARMUP_SHEET_URL,
      contactCount: Number(options.count),
      excludedLabelPrefixes: options.excludeLabelPrefix,
      excludedEmails: options.excludeEmail,
      dryRun: options.dryRun,
    });

    const output = JSON.stringify(result.spec, null, 2);
    if (options.output) {
      writeFileSync(options.output, output);
      console.log(`Run spec written to ${options.output}`);
    } else {
      console.log(output);
    }

    console.error(
      `\nPlanned ${result.spec.contactCount} contacts (excluded ${result.spec.excludedCount}/${result.spec.totalPoolSize})` +
        (result.historyWritten ? ` — appended to ${WARMUP_SHEET_NAME}` : ' — dry run, no sheet write')
    );
  });

program
  .command('run')
  .description('Full cycle: plan → enrich → generate → judge → correct → draft → digest')
  .option('-c, --contacts <path>', 'JSON file with contact pool')
  .option('--from-google', 'Load contacts from Google People API', false)
  .option('-s, --sheet <url>', 'Google Sheet URL for Warmup History tab')
  .option('-n, --count <number>', 'Contacts to select', '5')
  .option('-o, --output <path>', 'Write run-result.json to path')
  .option('--dry-run', 'Generate + judge only — no Gmail drafts, sheet, or digest', false)
  .option('--skip-digest', 'Skip digest email to MY_EMAIL', false)
  .option('--exclude-label-prefix <prefix>', 'Exclude contacts with matching label prefix', collect, [])
  .option('--exclude-email <email>', 'Exclude specific email', collect, [])
  .action(async options => {
    const contactsJson = options.contacts
      ? readFileSync(options.contacts, 'utf-8')
      : undefined;

    const orchestrator = new WarmupOrchestrator();
    const { spec, result, historyWritten } = await orchestrator.runPhase({
      contactsJson,
      useGoogleContacts: options.fromGoogle,
      spreadsheetUrl: options.sheet ?? process.env.WARMUP_SHEET_URL,
      contactCount: Number(options.count),
      excludedLabelPrefixes: options.excludeLabelPrefix,
      excludedEmails: options.excludeEmail,
      dryRun: options.dryRun,
      skipDigest: options.skipDigest,
    });

    if (options.output) {
      writeFileSync(options.output, JSON.stringify({ spec, result }, null, 2));
      console.log(`Run result written to ${options.output}`);
    } else if (options.dryRun) {
      console.log(JSON.stringify({ spec, result }, null, 2));
    } else {
      console.log(buildDigestEmail(result).body);
    }

    const created = result.contacts.filter(c => c.status === 'DRAFT_CREATED').length;
    const failed = result.contacts.filter(c => c.status === 'FAILED').length;
    console.error(
      `\nRun ${spec.runId}: ${created} drafts, ${failed} failed, $${result.totalCostUsd.toFixed(3)} est. cost` +
        (historyWritten ? ' — history appended' : '') +
        (result.digestSent ? ' — digest sent' : '')
    );
  });

program
  .command('init-sheet')
  .description('Ensure Warmup History tab exists with headers')
  .requiredOption('-s, --sheet <url>', 'Google Sheet URL')
  .action(async options => {
    const spreadsheetId = extractSpreadsheetId(options.sheet);
    const sheetService = new WarmupSheetService();
    await sheetService.ensureSheet(spreadsheetId);
    console.log(`✅ "${WARMUP_SHEET_NAME}" tab ready in spreadsheet ${spreadsheetId}`);
  });

program
  .command('score')
  .description('Score and rank contacts (no sheet write)')
  .option('-c, --contacts <path>', 'JSON file with contact pool')
  .option('--from-google', 'Load contacts from Google People API', false)
  .option('-n, --count <number>', 'Top N to show', '10')
  .action(async options => {
    const contactsJson = options.contacts
      ? readFileSync(options.contacts, 'utf-8')
      : undefined;

    const orchestrator = new WarmupOrchestrator();
    const result = await orchestrator.planPhase({
      contactsJson,
      useGoogleContacts: options.fromGoogle,
      contactCount: Number(options.count),
      dryRun: true,
    });

    for (const item of result.spec.contacts) {
      console.log(
        `${item.score.totalScore.toFixed(1)}\t${item.contact.displayName}\t${item.score.rationale}`
      );
    }
  });

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
});

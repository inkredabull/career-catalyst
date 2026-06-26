#!/usr/bin/env tsx
/**
 * CLI entry point for linkedin-automation.
 * Invoked by unified-server via:
 *   npm run dev --workspace=@inkredabull/career-catalyst-linkedin-automation -- connect <args>
 *
 * Usage:
 *   tsx src/cli.ts connect \
 *     --firstName Alice \
 *     --linkedInUrl https://linkedin.com/in/alice \
 *     [--domain "AI ops"] [--round "Seed"] \
 *     [--companyLinkedInUrl https://linkedin.com/company/acme] \
 *     [--companyUrl https://acme.com]
 */

import { generateConnectScript, generateFollowScript } from './scripts/index.js';
import { loadTemplate, buildMessage } from './message/template.js';
import { countTabs, openTab, injectScript, closeTab, sleep } from './chrome/tabs.js';
import { appendCompanyRow } from './sheets/company.js';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function connect(): Promise<void> {
  const firstName = arg('firstName');
  const linkedInUrl = arg('linkedInUrl');
  if (!firstName || !linkedInUrl) {
    console.error('Usage: cli.ts connect --firstName <name> --linkedInUrl <url> [options]');
    process.exit(1);
  }

  const domain = arg('domain');
  const round = arg('round');
  const companyLinkedInUrl = arg('companyLinkedInUrl');
  const companyUrl = arg('companyUrl');

  const template = loadTemplate();
  const message = buildMessage(template, {
    firstName,
    domain: domain ?? 'your space',
    round: round ? ` (${round})` : '',
    summary: domain ?? 'your space',
    event: '',
  });

  const start = countTabs();

  // 1. Open person profile + inject connect modal
  openTab(linkedInUrl);
  await sleep(4000);
  injectScript(start + 1, generateConnectScript(message));
  console.log(`[connect] Injected connect modal for ${firstName}`);
  console.log(`[connect] message: ${message}`);

  // 2. Optionally open company page + follow + append sheet row
  if (companyLinkedInUrl) {
    await sleep(1500);
    openTab(companyLinkedInUrl);
    await sleep(4000);
    injectScript(start + 2, generateFollowScript());
    console.log(`[connect] Injected follow script for ${companyLinkedInUrl}`);
    await closeTab(start + 2);

    await appendCompanyRow({ companyUrl, companyLinkedInUrl, stage: round, notes: domain });
    console.log(`[connect] Company row appended`);
  }
}

const command = process.argv[2];
if (command === 'connect') {
  connect().catch(err => { console.error(err); process.exit(1); });
} else {
  console.error(`Unknown command: ${command}. Available: connect`);
  process.exit(1);
}

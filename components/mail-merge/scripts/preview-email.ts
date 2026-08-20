// Local email template preview — no GAS deployment needed.
// Bootstraps GAS shims, fetches real job metadata from localhost:3000,
// and prints the resolved subject + body to stdout.
//
// Usage:
//   npm run preview -- --jobId <id>
//   npm run preview -- --jobId <id> --person "Jane Smith" --personUrl "https://linkedin.com/in/..."
//   npm run preview -- --jobId <id> --template scripts/templates/warm-intro.json

import * as fs from 'fs';
import * as path from 'path';
import syncFetch from 'sync-fetch';

// ── Bootstrap GAS shims ───────────────────────────────────────────────────────
// Must happen before importing any GAS-coupled source modules.

process.env.NGROK_TUNNEL_URL = process.env.NGROK_TUNNEL_URL ?? 'http://localhost:3000';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'WARN'; // suppress INFO noise during preview

(global as unknown as Record<string, unknown>).UrlFetchApp = {
  fetch: (url: string, options: Record<string, unknown> = {}) => {
    const headers: Record<string, string> = { ...(options['headers'] as Record<string, string> ?? {}) };
    if (options['contentType']) headers['Content-Type'] = options['contentType'] as string;
    const res = (syncFetch as unknown as typeof syncFetch)(url, {
      method: (options['method'] as string ?? 'GET').toUpperCase(),
      headers,
      body: options['payload'] as string | undefined,
    });
    const text = res.text();
    return { getResponseCode: () => res.status as number, getContentText: () => text as string };
  },
};

(global as unknown as Record<string, unknown>).PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (key: string) => process.env[key] ?? null,
  }),
};

const _cache = new Map<string, string>();
(global as unknown as Record<string, unknown>).CacheService = {
  getScriptCache: () => ({
    get: (key: string) => _cache.get(key) ?? null,
    put: (key: string, value: string) => { _cache.set(key, value); },
    remove: (key: string) => { _cache.delete(key); },
  }),
};

(global as unknown as Record<string, unknown>).Logger = {
  log: (msg: string, ...args: unknown[]) => {
    if (process.env.LOG_LEVEL === 'DEBUG') console.log(msg, ...args);
  },
};

// ── Import after shims ────────────────────────────────────────────────────────

import { fillInTemplateFromObject } from '../src/services/gmail';

// ── Argument parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const get = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};

const jobId = get('--jobId');
if (!jobId) {
  console.error('Usage: npm run preview -- --jobId <id> [--person "Name"] [--personUrl "url"] [--template path/to/template.json]');
  process.exit(1);
}

const personName = get('--person') ?? '';
const personUrl = get('--personUrl') ?? '';
const templatePath = get('--template');

// ── Default template ──────────────────────────────────────────────────────────

const DEFAULT_TEMPLATE = {
  subject: 'Get your help for {{JobTitleShorthand}} role at {{Company}}?',
  text: [
    '{{Blurb}}',
    '',
    '{{Intro}}',
    '',
    '{{Ask}}',
    '',
    '{{Valediction}}',
  ].join('\n'),
  html: '',
};

interface MsgObj { subject: string; text: string; html: string; }

let template: MsgObj;
if (templatePath) {
  const abs = path.resolve(templatePath);
  template = JSON.parse(fs.readFileSync(abs, 'utf-8')) as MsgObj;
} else {
  template = DEFAULT_TEMPLATE;
}

// ── Run ───────────────────────────────────────────────────────────────────────

const row: Record<string, string> = {
  JobID: jobId,
  PersonName: personName,
  PersonURL: personUrl,
  First: 'Recipient',
  Recipient: 'recipient@example.com',
};

console.log(`\nResolving template for job ID: ${jobId}`);
console.log(`Server: ${process.env.NGROK_TUNNEL_URL}\n`);
console.log('─'.repeat(60));

let resolved: MsgObj;
try {
  resolved = fillInTemplateFromObject(template, row);
} catch (e) {
  console.error('Template resolution failed:', e);
  process.exit(1);
}

console.log('\n=== SUBJECT ===');
console.log(resolved.subject);
console.log('\n=== BODY ===');
console.log(resolved.text);
console.log('\n' + '─'.repeat(60));

// ── Unresolved token check ────────────────────────────────────────────────────

const unresolved = [
  ...(resolved.subject.match(/\{\{[^}]+\}\}/g) ?? []),
  ...(resolved.text.match(/\{\{[^}]+\}\}/g) ?? []),
];

if (unresolved.length > 0) {
  console.log('\n⚠  Unresolved tokens:');
  [...new Set(unresolved)].forEach(t => console.log(`   ${t}`));
  process.exit(1);
} else {
  console.log('\n✓  All tokens resolved');
}

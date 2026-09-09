#!/usr/bin/env node
/**
 * networker — unified LinkedIn networking CLI
 *
 * Commands:
 *   discover <file>         Look up profiles for a name list
 *   send <file>             Open Chrome tabs + inject connect modals (new contacts)
 *   review                  Show contacts due for withdrawal / re-invite
 *   reinvite                Open Chrome tabs + inject connect modals (re-invites)
 *   mark-withdrawn <ids>    Manually mark contacts as withdrawn
 *   mark-complete <ids>     Manually mark contacts as complete
 *   migrate <csv>           One-time import of withdrawn_log.csv
 */

import 'dotenv/config';
import dotenv from 'dotenv';
import { resolve } from 'path';
// Also load the monorepo root .env (for shared creds like GOOGLE_CLIENT_ID/
// GOOGLE_REFRESH_TOKEN, used by @inkredabull/career-catalyst-linkedin-automation's
// sheet-append helpers) without overriding anything networker/.env already set.
dotenv.config({ path: resolve(import.meta.dirname, '..', '..', '..', '.env') });
import { Command } from 'commander';
import { registerDiscover } from './commands/discover.js';
import { registerSend } from './commands/send.js';
import { registerReview } from './commands/review.js';
import { registerReinvite } from './commands/reinvite.js';
import { registerMark } from './commands/mark.js';
import { registerMigrate } from './commands/migrate.js';

const program = new Command();

program
  .name('networker')
  .description('Unified LinkedIn networking CLI — discovery, outreach, and lifecycle tracking')
  .version('1.0.0');

registerDiscover(program);
registerSend(program);
registerReview(program);
registerReinvite(program);
registerMark(program);
registerMigrate(program);

program.parse();

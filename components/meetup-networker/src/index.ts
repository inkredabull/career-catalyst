#!/usr/bin/env node

import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { Command } from 'commander';
import { parseNameList } from './nameParser.js';
import {
  lookupProfiles,
  getCreditBalance,
  type ContactPriorityTier
} from './profileLookup.js';
import { parseEventFromFileName } from './eventParser.js';
import { openMessageModal } from './linkedinAutomation.js';
import { loadAllCachedProfiles, markConnectionSent } from './cache.js';

const program = new Command();

const DEFAULT_BATCH_SIZE = 12;
const MIN_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 15;
const DEFAULT_MAX_SENDS = 8;

function parsePositiveInt(input: string | undefined, fallback: number): number {
  if (!input) {
    return fallback;
  }
  const parsed = parseInt(input, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

function resolveBatchSize(cliBatchSize?: string): number {
  const requestedSize = parsePositiveInt(
    cliBatchSize ?? process.env.BATCH_SIZE,
    DEFAULT_BATCH_SIZE
  );

  if (requestedSize < MIN_BATCH_SIZE) {
    console.log(`Batch size ${requestedSize} is below ${MIN_BATCH_SIZE}; using ${MIN_BATCH_SIZE}.`);
    return MIN_BATCH_SIZE;
  }
  if (requestedSize > MAX_BATCH_SIZE) {
    console.log(`Batch size ${requestedSize} is above ${MAX_BATCH_SIZE}; using ${MAX_BATCH_SIZE}.`);
    return MAX_BATCH_SIZE;
  }
  return requestedSize;
}

function normalizeTier(tierInput?: string): ContactPriorityTier {
  if (!tierInput || tierInput.toLowerCase() === 'all') {
    return 'NONE';
  }
  const normalized = tierInput.toUpperCase().replace('-', '_');
  if (normalized === 'TIER_1' || normalized === 'TIER_2' || normalized === 'TIER_3') {
    return normalized;
  }
  throw new Error(`Invalid --send-tier "${tierInput}". Use one of: tier_1, tier_2, tier_3, all`);
}

function tierRank(tier?: ContactPriorityTier): number {
  if (tier === 'TIER_1') {
    return 1;
  }
  if (tier === 'TIER_2') {
    return 2;
  }
  if (tier === 'TIER_3') {
    return 3;
  }
  return 99;
}

function isTierSelected(profileTier: ContactPriorityTier | undefined, sendTier: ContactPriorityTier): boolean {
  if (!profileTier || profileTier === 'NONE') {
    return false;
  }
  if (sendTier === 'NONE') {
    return true; // --send-tier all
  }
  return profileTier === sendTier; // exact tier match only
}

program
  .name('meetup-networker')
  .description('Look up LinkedIn profiles for a list of names')
  .version('1.0.0')
  .argument('<file>', 'Path to file containing list of names (one per line)')
  .option('--batch-size <number>', 'Batch size (clamped to 10-15)')
  .option('--send', 'Open profiles and inject outreach messages after review')
  .option('--send-tier <tier>', 'Highest tier to include when sending: tier_1, tier_2, tier_3, all', 'tier_1')
  .option('--max-sends <number>', 'Max profiles to send in one run', `${DEFAULT_MAX_SENDS}`)
  .action(async (filePath: string, options: {
    batchSize?: string;
    send?: boolean;
    sendTier?: string;
    maxSends?: string;
  }) => {
    try {
      const batchSize = resolveBatchSize(options.batchSize);
      const sendMode = Boolean(options.send);
      const sendTier = normalizeTier(options.sendTier);
      const maxSends = parsePositiveInt(options.maxSends, DEFAULT_MAX_SENDS);

      // Parse event info from filename
      const eventInfo = parseEventFromFileName(filePath);
      console.log(`Event: ${eventInfo.eventName}`);
      console.log(`Reading names from: ${filePath}\n`);
      console.log(`Mode: ${sendMode ? 'SEND' : 'REVIEW ONLY'}`);
      console.log(`Batch size: ${batchSize}`);
      if (sendMode) {
        const sendTierLabel = sendTier === 'NONE' ? 'ALL' : sendTier;
        console.log(`Send tier: ${sendTierLabel}`);
        console.log(`Max sends: ${maxSends}`);
      }
      console.log('');

      // Read file
      const content = readFileSync(filePath, 'utf-8');

      // Parse names
      const parsedNames = parseNameList(content);
      console.log(`Found ${parsedNames.length} names in file\n`);

      let profiles: Awaited<ReturnType<typeof lookupProfiles>> = [];
      let balanceBefore: number | null = null;
      let balanceAfter: number | null = null;
      let remainingNames: typeof parsedNames = [];

      // If file is empty, check for cached target contacts
      if (parsedNames.length === 0) {
        console.log('File is empty. Checking for cached target contacts...\n');
        const cachedProfiles = loadAllCachedProfiles(eventInfo.eventName);
        const targetContacts = cachedProfiles.filter(
          p => p.isTargetContact && !p.error
        );

        if (targetContacts.length > 0) {
          console.log(`Found ${targetContacts.length} cached target contact(s) for this event\n`);
          profiles = targetContacts;
        } else {
          console.log('No cached target contacts found for this event.\n');
        }
      } else {
        const namesToProcess = parsedNames.slice(0, batchSize);
        remainingNames = parsedNames.slice(batchSize);

        console.log(`Processing ${namesToProcess.length} names in this batch`);
        if (remainingNames.length > 0) {
          console.log(`${remainingNames.length} names will remain in file for next batch\n`);
        } else {
          console.log(`This is the final batch\n`);
        }

        // Check credit balance before processing
        console.log('Checking credit balance...');
        balanceBefore = await getCreditBalance();
        if (balanceBefore !== null && balanceBefore !== undefined) {
          console.log(`Credit balance before: ${balanceBefore} credits\n`);
        } else {
          console.log('Unable to fetch credit balance\n');
        }

        // Lookup profiles
        console.log('Looking up LinkedIn profiles...\n');
        profiles = await lookupProfiles(namesToProcess, eventInfo.eventName);
      }

      // Check credit balance after processing (only if we did lookups)
      if (parsedNames.length > 0) {
        console.log('\nChecking credit balance...');
        balanceAfter = await getCreditBalance();
        if (balanceAfter !== null && balanceAfter !== undefined) {
          console.log(`Credit balance after: ${balanceAfter} credits`);
        } else {
          console.log('Unable to fetch credit balance');
        }

        // Calculate cost
        if (balanceBefore !== null && balanceBefore !== undefined &&
            balanceAfter !== null && balanceAfter !== undefined) {
          const cost = balanceBefore - balanceAfter;
          console.log(`\nCost: ${cost} credits used\n`);
        } else {
          console.log('\nCost: Unable to calculate (credit balance unavailable)\n');
        }
      }

      // Display results
      const isUsingCached = parsedNames.length === 0 && profiles.length > 0;
      const resultsHeader = isUsingCached 
        ? `=== ${eventInfo.eventName} - Cached Target Contacts ===`
        : `=== ${eventInfo.eventName} - Results ===`;
      console.log(`${resultsHeader}\n`);

      // Count target contacts
      const targetContacts = profiles.filter(p => p.isTargetContact);
      const tier1Count = targetContacts.filter(p => p.priorityTier === 'TIER_1').length;
      const tier2Count = targetContacts.filter(p => p.priorityTier === 'TIER_2').length;
      const tier3Count = targetContacts.filter(p => p.priorityTier === 'TIER_3').length;

      profiles.forEach((profile, index) => {
        const targetIndicator = profile.isTargetContact
          ? ` [⭐ ${profile.priorityTier || 'TARGET'}]`
          : '';
        console.log(`${index + 1}. ${profile.name}${targetIndicator}`);
        if (profile.error) {
          console.log(`   Error: ${profile.error}`);
        } else {
          console.log(`   Current Title: ${profile.currentTitle || 'N/A'}`);
          if (profile.currentCompany) {
            console.log(`   Current Company: ${profile.currentCompany}`);
          }
          console.log(`   Location: ${profile.location || 'N/A'}`);
          if (profile.condensedSummary) {
            console.log(`   Summary: ${profile.condensedSummary}`);
          }
          if (profile.linkedinUrl) {
            console.log(`   LinkedIn: ${profile.linkedinUrl}`);
          }
          if (profile.isTargetContact) {
            console.log(`   Status: ✅ REVIEW - ${profile.priorityTier || 'TARGET'} follow-up candidate`);
          } else {
            console.log(`   Status: ⏭️  SKIP - No priority tier match`);
          }
        }
        console.log('');
      });

      console.log(`Successfully processed ${profiles.length} profiles`);
      console.log(`Target contacts to follow up: ${targetContacts.length}/${profiles.length}`);
      console.log(`Tier summary: T1=${tier1Count}, T2=${tier2Count}, T3=${tier3Count}`);

      // Weekly loop: review by default, explicit send only when --send is passed.
      const sendCandidates = targetContacts
        .filter(p => p.linkedinUrl && isTierSelected(p.priorityTier, sendTier) && !p.connectionSent)
        .sort((a, b) => tierRank(a.priorityTier) - tierRank(b.priorityTier))
        .slice(0, maxSends);

      const alreadySentCount = targetContacts.filter(p => p.connectionSent).length;
      if (alreadySentCount > 0) {
        console.log(`Skipping ${alreadySentCount} already-sent connection(s)`);
      }

      if (!sendMode && sendCandidates.length > 0) {
        console.log('\nReview complete. To send this week, run with:');
        console.log(`  npm start "${filePath}" -- --send --send-tier tier_1 --max-sends ${DEFAULT_MAX_SENDS}`);
      }

      if (sendMode && sendCandidates.length > 0) {
        console.log(`\nOpening ${sendCandidates.length} LinkedIn profile(s) in Chrome...`);

        // Get the current number of tabs in Chrome before opening new ones
        let startingTabCount = 1;
        try {
          const tabCountScript = `osascript -e 'tell application "Google Chrome" to count tabs of front window'`;
          const result = execSync(tabCountScript, { encoding: 'utf-8' }).trim();
          startingTabCount = parseInt(result, 10);
        } catch (error) {
          console.log('  Note: Could not detect existing tab count, assuming 1');
        }

        // Open each profile in a new tab
        for (let i = 0; i < sendCandidates.length; i++) {
          const profile = sendCandidates[i];

          // Open LinkedIn URL in Chrome
          execSync(`open -a "Google Chrome" "${profile.linkedinUrl}"`, { stdio: 'ignore' });
          console.log(`  Opened: ${profile.name}`);

          // Add random delay between 1250ms and 3000ms (except for last one)
          if (i < sendCandidates.length - 1) {
            const delay = Math.floor(Math.random() * (3750 - 1600 + 1)) + 1600;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }

        console.log('\nFinished opening LinkedIn profiles.');

        // Wait for pages to load before injecting
        console.log('\nWaiting 4s for pages to load...');
        await new Promise(resolve => setTimeout(resolve, 4000));

        console.log('\nOpening message modals...\n');
        for (let i = 0; i < sendCandidates.length; i++) {
          const profile = sendCandidates[i];
          const tabIndex = startingTabCount + i + 1;
          await openMessageModal(profile, tabIndex, eventInfo.eventName);

          // Mark as sent in cache
          const nameParts = profile.name.trim().split(/\s+/);
          const first = profile.firstName || nameParts[0] || '';
          const last = nameParts[nameParts.length - 1] || '';
          markConnectionSent(first, last, eventInfo.eventName);
          console.log(`  Marked ${profile.name} as connection sent`);

          if (i < sendCandidates.length - 1) {
            const delay = Math.floor(Math.random() * (1500 - 800 + 1)) + 800;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }

        console.log('\n✅ Message modals populated. Review and send each when ready.');
      } else if (sendMode) {
        const tierLabel = sendTier === 'NONE' ? 'ALL' : sendTier;
        console.log(`\nNo send candidates found for tier filter ${tierLabel}.`);
      }

      // Update file with remaining names (only if we processed names from file)
      if (parsedNames.length > 0) {
        const remainingNames = parsedNames.slice(batchSize);

        if (remainingNames.length > 0) {
          console.log(`\n📝 Updating file with ${remainingNames.length} remaining names...`);
          const remainingContent = remainingNames.map(n => n.original).join('\n') + '\n';
          writeFileSync(filePath, remainingContent, 'utf-8');
          console.log(`✅ File updated. Run again to process next batch.`);
        } else {
          console.log(`\n🎉 All names processed! File is now empty.`);
          writeFileSync(filePath, '', 'utf-8');
        }
      }

    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
      } else {
        console.error('An unknown error occurred');
      }
      process.exit(1);
    }
  });

program.parse();

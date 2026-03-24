#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import { getConfig, getAnthropicConfig } from '@inkredabull/career-catalyst-core';
import { ApplicationAgent } from './agent';

const program = new Command();

program
  .name('career-catalyst-apply')
  .description('Automated job application form filling with Stagehand browser automation')
  .version('1.0.0');

program
  .command('apply')
  .description('Fill out a job application form using resume and interview prep data')
  .argument('<jobId>', 'Job ID to use for resume and interview prep data')
  .argument('<applicationUrl>', 'URL of the job application form')
  .option('--dry-run', 'Open the form to inspect requirements without generating statements')
  .option('--skip', 'Skip automatic interview prep statement generation if missing')
  .action(async (jobId: string, applicationUrl: string, options: { dryRun?: boolean; skip?: boolean }) => {
    try {
      console.log('🎯 Starting job application process...');
      console.log(`📋 Application URL: ${applicationUrl}`);
      console.log(`📊 Job ID: ${jobId}`);
      console.log('');

      const openaiConfig = getConfig();
      const anthropicConfig = getAnthropicConfig();
      const applicationAgent = new ApplicationAgent(openaiConfig, anthropicConfig.anthropicApiKey, anthropicConfig.maxRoles);

      // Display mode information
      if (options.dryRun) {
        console.log('🔍 DRY RUN MODE: Will open form to inspect requirements without generating statements');
        console.log('');
      } else if (options.skip) {
        console.log('⏭️  SKIP MODE: Will bypass automatic interview prep statement generation');
        console.log('');
      }

      const result = await applicationAgent.fillApplication(applicationUrl, jobId, {
        dryRun: options.dryRun || false,
        skipGeneration: options.skip || false
      });

      if (result.success) {
        console.log('\n✅ Application Form Analysis Complete');
        console.log('='.repeat(80));
        console.log('🔍 Form has been parsed and fields have been filled');
        console.log('⚠️  IMPORTANT: Review all generated content before submitting!');
        console.log('');
        if (result.instructions) {
          console.log('📋 Next Steps:');
          console.log(result.instructions);
        }
        console.log('');
        console.log(`📄 Session logged to: logs/${jobId}/application-*.json`);
      } else {
        console.error(`❌ Application filling failed: ${result.error}`);
        process.exit(1);
      }

    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Allow bare invocation: `career-catalyst-apply <jobId> <url>` (no subcommand)
program.addHelpText('after', `
Examples:
  npm run apply -- apply <jobId> <url>
  npm run apply -- apply <jobId> <url> --dry-run
  npm run apply -- apply <jobId> <url> --skip
`);

program.parse(process.argv);

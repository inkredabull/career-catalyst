#!/usr/bin/env node

import { Command } from 'commander';
import { JobExtractorAgent } from './agents/job-extractor-agent';
import { JobScorerAgent } from './agents/job-scorer-agent';
import { ResumeCreatorAgent } from './agents/resume-creator-agent';
import { ResumeCriticAgent } from './agents/resume-critic-agent';
import { OutreachAgent } from './agents/outreach-agent';
import { MetricsAgent } from './agents/metrics-agent';
import { WhoGotHiredAgent } from './agents/whogothired-agent';
import { ModeDetectorAgent } from './agents/mode-detector-agent';
import { getConfig, getAnthropicConfig, getResumeGenerationConfig, getCritiqueAndJudgeMaxAttempts, getBlurbConfig } from './config';
import { BlurbGeneratorAgent } from './agents/blurb-generator-agent';
import { maybeRefreshOpenRouterModels } from './utils/openrouter-model-refresh';
import { LLMProviderConfig } from './providers/llm-provider';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fss from 'fs';
import { execSync } from 'child_process';
import { createSheetsLogger } from './integrations/sheets-logger';
import { resolveFromProjectRoot } from './utils/project-root';

// Helper function to find CV file automatically
async function findCvFile(): Promise<string> {
  let projectRoot = process.cwd();
  try {
    let currentDir = process.cwd();
    while (currentDir !== path.dirname(currentDir)) {
      const pkgPath = path.join(currentDir, 'package.json');
      if (fss.existsSync(pkgPath)) {
        const pkg = JSON.parse(fss.readFileSync(pkgPath, 'utf-8'));
        if (pkg.workspaces) {
          projectRoot = currentDir;
          break;
        }
      }
      currentDir = path.dirname(currentDir);
    }
  } catch {
    // fall through: use cwd
  }

  if (process.env.CV_PATH) {
    const candidates = [
      process.env.CV_PATH,
      path.resolve(projectRoot, process.env.CV_PATH),
    ];
    for (const p of candidates) {
      try {
        await fs.access(p);
        console.log(`📄 Using CV file from CV_PATH: ${p}`);
        return p;
      } catch {
        // try next
      }
    }
    throw new Error(`CV file not found at CV_PATH=${process.env.CV_PATH} (tried relative to cwd and project root)`);
  }

  const possiblePaths = [
    'cv.txt',
    './cv.txt',
    'CV.txt',
    './CV.txt',
    'sample-cv.txt',
    './sample-cv.txt',
    path.join(projectRoot, 'cv.txt'),
    path.join(projectRoot, 'CV.txt'),
    path.join(projectRoot, 'sample-cv.txt'),
    path.join(projectRoot, 'data', 'cv.txt'),
    path.join(projectRoot, 'data', 'CV.txt')
  ];

  for (const cvPath of possiblePaths) {
    try {
      await fs.access(cvPath);
      console.log(`📄 Found CV file: ${cvPath}`);
      return cvPath;
    } catch {
      // continue
    }
  }

  throw new Error('CV file not found. Set CV_PATH in .env or create cv.txt in the project root.');
}

const program = new Command();

program
  .name('job-extractor')
  .description('Extract and score job information from job posting URLs using AI')
  .version('1.0.0');

program
  .command('extract')
  .description('Extract job information from URL, HTML, or JSON and automatically score it')
  .argument('<input>', 'URL of job posting, HTML content, or JSON object to extract/process')
  .option('-t, --type <type>', 'Input type: url, html, json, or jsonfile', 'url')
  .option('-o, --output <file>', 'Output file to save the extracted data (optional)')
  .option('-f, --format <format>', 'Output format: json or pretty', 'pretty')
  .option('-c, --criteria <file>', 'Path to criteria file for scoring', 'criteria.json')
  .option('--no-score', 'Skip automatic scoring after extraction')
  .option('--force-extract', 'Extract job even if competition is too high')
  .option('--reminder-priority <priority>', 'Reminder priority for macOS reminders (1=High, 5=Medium, 9=Low)', '5')
  .option('--no-reminders', 'Skip creating macOS reminders (useful for preview/display purposes)')
  .option('--selected-reminders <reminders>', 'Comma-separated list of reminders to create: track,apply,ping,prep,followup')
  .option('--skip-post-workflow', 'Skip post-extraction workflow (scoring, resume generation)')
  .action(async (input: string, options) => {
    try {
      console.log('🔍 Extracting job information...');
      console.log(`📄 Input Type: ${options.type}`);
      console.log(`📄 Input: ${options.type === 'json' ? 'JSON data' : input.substring(0, 100)}...`);
      console.log('');

      const config = getConfig();
      const agent = new JobExtractorAgent(config);

      // Parse selected reminders if provided
      const selectedReminders: string[] | undefined = options.selectedReminders
        ? options.selectedReminders.split(',').map((r: string) => r.trim())
        : undefined;

      if (selectedReminders && selectedReminders.length > 0) {
        console.log(`📋 Selected reminders: ${selectedReminders.join(', ')}`);
      }

      const result = await agent.extractFromInput(input, options.type, {
        ignoreCompetition: options.forceExtract,
        reminderPriority: parseInt(options.reminderPriority) || 5,
        skipReminders: options.noReminders,
        skipPostWorkflow: options.skipPostWorkflow,
        selectedReminders: selectedReminders
      });

      if (!result.success) {
        console.error('❌ Error:', result.error);
        process.exit(1);
      }

      if (!result.data) {
        console.error('❌ No data extracted');
        process.exit(1);
      }

      // Use the job ID returned by the agent (it already wrote job-cache.json)
      const jobId = result.jobId!;
      const jobDir = resolveFromProjectRoot('logs', jobId);
      // Ensure directory exists (agent should have created it, but be safe)
      await fs.mkdir(jobDir, { recursive: true });

      // Agent already wrote job-cache.json; no separate file write needed here
      console.log(`✅ Job information cached to logs/${jobId}/job-cache.json`);

      // Process job description with required terms extraction and index update
      await agent.processJobDescription(jobId, result.data.description);

      // Log to Google Sheets immediately — regardless of whether scoring runs
      const sheetsLogger = createSheetsLogger();
      if (sheetsLogger) {
        try {
          await sheetsLogger.logTracked(
            jobId,
            result.data.title,
            result.data.company,
            result.data.url || '',
            'CLI',
            result.data
          );
        } catch (sheetsError) {
          console.error('❌ Google Sheets logging failed — job was extracted but NOT written to sheet. Re-run: npm run dev track-sheet', jobId);
        }
      }

      // Auto-generate first and third person blurbs via Gemini Flash (via OpenRouter)
      if (process.env.OPENROUTER_API_KEY) {
        try {
          console.log('\n✍️  Generating blurbs...');
          const blurbAgent = new BlurbGeneratorAgent(getBlurbConfig());
          const blurbs = await blurbAgent.generate({
            title: result.data.title,
            company: result.data.company,
            description: result.data.description || ''
          });

          const blurbPath = path.join(jobDir, 'blurbs.json');
          await fs.writeFile(blurbPath, JSON.stringify({ jobId, role: result.data.title, company: result.data.company, generatedAt: new Date().toISOString(), ...blurbs }, null, 2), 'utf-8');

          console.log('\n📝 FIRST PERSON:');
          console.log(blurbs.firstPerson);
          console.log('\n📝 THIRD PERSON:');
          console.log(blurbs.thirdPerson);
          console.log(`\n💾 Blurbs saved to ${blurbPath}`);
        } catch (blurbError) {
          console.warn(`⚠️  Blurb generation failed (non-blocking): ${blurbError instanceof Error ? blurbError.message : blurbError}`);
        }
      }

      // Automatically score the job unless --no-score or --skip-post-workflow is specified
      if (options.score !== false && !options.skipPostWorkflow) {
        console.log('');
        
        // Check if job already has a score >= 65
        try {
          const jobDir = resolveFromProjectRoot('logs', jobId);
          if (fss.existsSync(jobDir)) {
            const files = fss.readdirSync(jobDir);
            const scoreFiles = files.filter(f => f.startsWith('score-') && f.endsWith('.json'));
            
            if (scoreFiles.length > 0) {
              // Get the most recent score file
              const mostRecentScoreFile = scoreFiles.sort().reverse()[0];
              const scorePath = path.join(jobDir, mostRecentScoreFile);
              const scoreData = JSON.parse(fss.readFileSync(scorePath, 'utf-8'));
              
              if (scoreData.score >= 65) {
                console.log('📊 EXISTING SCORE DETECTED - SKIPPING AUTO-SCORING');
                console.log('=' .repeat(60));
                console.log(`🎯 Job already scored: ${scoreData.score}% (>= 65% threshold)`);
                console.log(`⏰ Score date: ${new Date(scoreData.timestamp).toLocaleString()}`);
                console.log('');
                console.log('💡 HIGH SCORE DETECTED - MANUAL REVIEW RECOMMENDED');
                console.log('   This job has a strong match score and should be manually reviewed');
                console.log('   for strategic application planning and customization.');
                console.log('');
                console.log('🔄 To re-score this job, use: npm run dev score ' + jobId);
                console.log('=' .repeat(60));
                console.log('');
                console.log(jobId);
                return;
              }
            }
          }
        } catch (scoreCheckError) {
          console.log('⚠️  Could not check existing score, proceeding with scoring...');
        }
        
        console.log('🎯 Automatically scoring job...');
        
        try {
          const scorer = new JobScorerAgent(config, options.criteria);
          const score = await scorer.scoreJob(jobId);
          
          console.log('✅ Job Scoring Complete');
          console.log('=' .repeat(50));
          console.log(`📊 Overall Score: ${score.overallScore}%`);
          console.log('');
          console.log('📈 Breakdown:');
          console.log(`  Required Skills: ${score.breakdown.required_skills}% - ${score.explanations.required_skills}`);
          console.log(`  Preferred Skills: ${score.breakdown.preferred_skills}% - ${score.explanations.preferred_skills}`);
          console.log(`  Experience Level: ${score.breakdown.experience_level}% - ${score.explanations.experience_level}`);
          console.log(`  Salary Match: ${score.breakdown.salary}% - ${score.explanations.salary}`);
          console.log(`  Location Match: ${score.breakdown.location}% - ${score.explanations.location}`);
          console.log(`  Company Match: ${score.breakdown.company_match}% - ${score.explanations.company_match}`);
          console.log('');
          console.log('💡 Rationale:');
          console.log(score.rationale);
          console.log('');
          console.log(jobId);
          
        } catch (scoreError) {
          console.log('⚠️  Scoring failed (extraction was successful):');
          console.log(`   ${scoreError instanceof Error ? scoreError.message : 'Unknown scoring error'}`);
          console.log('   You can manually score later with: npm run dev score ' + jobId);
          console.log('');
          console.log(jobId);
        }
      } else {
        // When post-workflow is skipped, still output the job ID for parsing
        console.log('');
        console.log(jobId);
      }

      // Format output for display
      const jsonOutput = JSON.stringify(result.data, null, 2);
      let output: string;
      if (options.format === 'json') {
        output = jsonOutput;
      } else {
        // output = formatPrettyOutput(result.data);
        output = `✅ Job extracted and cached to logs/${jobId}/job-cache.json\n${jsonOutput}`;
      }

      // Output to additional file if specified
      if (options.output) {
        await fs.writeFile(options.output, output, 'utf-8');
        console.log(`✅ Job information also saved to ${options.output}`);
      // } else {
        // console.log(output);
      }

    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// function formatPrettyOutput(data: any): string {
//   let output = '';
//   output += '✅ Job Information Extracted:\n';
//   output += '=' .repeat(50) + '\n\n';
//   output += `📋 Title: ${data.title}\n`;
//   output += `🏢 Company: ${data.company}\n`;
//   output += `📍 Location: ${data.location}\n`;
//   
//   if (data.salary) {
//     output += `💰 Salary: `;
//     if (data.salary.min && data.salary.max) {
//       output += `${data.salary.min} - ${data.salary.max} ${data.salary.currency}\n`;
//     } else if (data.salary.min) {
//       output += `${data.salary.min} ${data.salary.currency}\n`;
//     } else if (data.salary.max) {
//       output += `Up to ${data.salary.max} ${data.salary.currency}\n`;
//     }
//   }
//   
//   output += '\n📝 Description:\n';
//   output += '-' .repeat(20) + '\n';
//   output += data.description + '\n';
//   
//   return output;
// }

program
  .command('extract-description')
  .description('Extract job description from existing job JSON file to data subdirectory')
  .argument('<jobId>', 'Job ID to extract description for')
  .action(async (jobId: string) => {
    try {
      console.log('📄 Extracting job description...');
      console.log(`📊 Job ID: ${jobId}`);
      console.log('');

      const jobDir = resolveFromProjectRoot('logs', jobId);

      // Check if job directory exists
      try {
        await fs.access(jobDir);
      } catch {
        console.error(`❌ Job directory not found: ${jobDir}`);
        process.exit(1);
      }

      // Find the most recent job JSON file
      const files = await fs.readdir(jobDir);
      const jobFiles = files
        .filter(file => file.startsWith('job-') && file.endsWith('.json'))
        .sort()
        .reverse(); // Most recent first

      if (jobFiles.length === 0) {
        console.error(`❌ No job JSON files found in ${jobDir}`);
        process.exit(1);
      }

      const jobFilePath = path.join(jobDir, jobFiles[0]);
      
      // Read and parse the job JSON file
      const jobDataRaw = await fs.readFile(jobFilePath, 'utf-8');
      const jobData = JSON.parse(jobDataRaw);

      if (!jobData.description) {
        console.error('❌ No description field found in job data');
        process.exit(1);
      }

      // Use JobExtractorAgent to process the description with required terms extraction
      const config = getConfig();
      const agent = new JobExtractorAgent(config);
      
      await agent.processJobDescription(jobId, jobData.description);
      
      console.log(`✅ Job description extracted from: ${jobFilePath}`);
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List all job IDs (subdirectories under logs)')
  .option('-v, --verbose', 'Show additional details for each job')
  .action(async (options) => {
    try {
      const logsDir = resolveFromProjectRoot('logs');

      // Check if logs directory exists
      try {
        await fs.access(logsDir);
      } catch {
        console.log('📁 No logs directory found - no jobs extracted yet');
        return;
      }

      // Read subdirectories
      const entries = await fs.readdir(logsDir, { withFileTypes: true });
      const jobIds = entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort();

      if (jobIds.length === 0) {
        console.log('📁 No job directories found in logs');
        return;
      }

      console.log(`📋 Found ${jobIds.length} job${jobIds.length === 1 ? '' : 's'}:`);
      console.log('=' .repeat(50));

      if (options.verbose) {
        // Show details for each job
        for (const jobId of jobIds) {
          const jobDir = path.join(logsDir, jobId);
          
          try {
            // Find job JSON file to get basic info
            const files = await fs.readdir(jobDir);
            const jobFiles = files
              .filter(file => file.startsWith('job-') && file.endsWith('.json'))
              .sort()
              .reverse(); // Most recent first

            if (jobFiles.length > 0) {
              const jobFilePath = path.join(jobDir, jobFiles[0]);
              const jobDataRaw = await fs.readFile(jobFilePath, 'utf-8');
              const jobData = JSON.parse(jobDataRaw);
              
              console.log(`\n📊 ${jobId}`);
              console.log(`   Company: ${jobData.company || 'Unknown'}`);
              console.log(`   Title: ${jobData.title || 'Unknown'}`);
              console.log(`   Location: ${jobData.location || 'Unknown'}`);
              if (jobData.salary) {
                const salaryStr = jobData.salary.min && jobData.salary.max 
                  ? `${jobData.salary.min} - ${jobData.salary.max} ${jobData.salary.currency || ''}`
                  : jobData.salary.min || jobData.salary.max || 'Not specified';
                console.log(`   Salary: ${salaryStr}`);
              }
              
              // Check what files exist
              const hasScore = files.some(f => f.startsWith('score-'));
              const hasResume = files.some(f => f.endsWith('.pdf'));
              const hasCritique = files.some(f => f.startsWith('critique-'));
              
              const status = [];
              if (hasScore) status.push('scored');
              if (hasResume) status.push('resume');
              if (hasCritique) status.push('critiqued');
              
              if (status.length > 0) {
                console.log(`   Status: ${status.join(', ')}`);
              }
            } else {
              console.log(`\n📊 ${jobId} (no job data found)`);
            }
          } catch (error) {
            console.log(`\n📊 ${jobId} (error reading job data)`);
          }
        }
      } else {
        // Simple list
        jobIds.forEach((jobId, index) => {
          console.log(`${index + 1}. ${jobId}`);
        });
      }

      console.log('');
      console.log('💡 Use --verbose (-v) flag for detailed information');
      console.log('💡 Use individual commands like "score <jobId>" or "resume <jobId> <cvFile>" to work with specific jobs');
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('create-job')
  .description('Create a new job ID and empty job JSON file for manual population')
  .option('-c, --company <company>', 'Company name (optional)')
  .option('-t, --title <title>', 'Job title (optional)')
  .option('-b, --blurb <blurb>', 'Relative path to a blurb file for job description synthesis (optional)')
  .option('-u, --url <url>', 'Company URL for gathering information (optional)')
  .action(async (options) => {
    try {
      console.log('📁 Creating new job entry...');
      if (options.company || options.title) {
        console.log(`🏢 Company: ${options.company || 'Not specified'}`);
        console.log(`📋 Title: ${options.title || 'Not specified'}`);
      }
      console.log('');

      const config = getConfig();
      const agent = new JobExtractorAgent(config);
      
      const result = await agent.createJob(options.company, options.title, options.blurb, options.url);
      
      console.log('✅ Job creation complete');
      console.log('=' .repeat(50));
      console.log(`📊 Job ID: ${result.jobId}`);
      console.log(`📄 File: ${result.filePath}`);
      console.log('');
      console.log('📝 Next steps:');
      console.log('1. Edit the JSON file to add job details');
      console.log(`2. Run: npm run dev extract-description ${result.jobId}`);
      console.log(`3. Run: npm run dev score ${result.jobId}`);
      console.log('');
      console.log('💡 Usage tip: Use -- to pass options correctly:');
      console.log('   npm run dev create-job -- --company "Company Name" --title "Job Title"');
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });


program
  .command('extract-for-eval')
  .description('Extract descriptions from all job directories to data/ and update index.jsonl')
  .action(async () => {
    try {
      console.log('🔄 Bulk extracting job descriptions for evaluation...');
      console.log('');

      const config = getConfig();
      const agent = new JobExtractorAgent(config);
      
      const results = await agent.extractForEval();
      
      console.log('');
      console.log('✅ Bulk extraction complete');
      console.log('=' .repeat(50));
      console.log(`📊 Summary:`);
      console.log(`   Processed: ${results.processed} jobs`);
      console.log(`   Skipped: ${results.skipped} jobs (already processed or no description)`);
      console.log(`   Errors: ${results.errors} jobs`);
      console.log('');
      
      if (results.processed > 0 || results.skipped > 0) {
        console.log(`📄 Job descriptions saved to: data/jd_*.txt`);
        console.log(`📋 Index updated in: data/index.jsonl`);
      }
      
      if (results.errors > 0) {
        console.log(`⚠️  ${results.errors} job(s) encountered errors during processing`);
      }
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('score')
  .description('Score a job posting against criteria')
  .argument('<jobId>', 'Job ID to score (from the log filename)')
  .option('-c, --criteria <file>', 'Path to criteria file', 'criteria.json')
  .action(async (jobId: string, options) => {
    try {
      console.log('🎯 Scoring job posting...');
      console.log(`📊 Job ID: ${jobId}`);
      console.log('');

      const config = getConfig();
      const scorer = new JobScorerAgent(config, options.criteria);
      
      const score = await scorer.scoreJob(jobId);
      
      console.log('✅ Job Scoring Complete');
      console.log('=' .repeat(50));
      console.log(`📊 Overall Score: ${score.overallScore}%`);
      console.log('');
      console.log('📈 Breakdown:');
      console.log(`  Required Skills: ${score.breakdown.required_skills}% - ${score.explanations.required_skills}`);
      console.log(`  Preferred Skills: ${score.breakdown.preferred_skills}% - ${score.explanations.preferred_skills}`);
      console.log(`  Experience Level: ${score.breakdown.experience_level}% - ${score.explanations.experience_level}`);
      console.log(`  Salary Match: ${score.breakdown.salary}% - ${score.explanations.salary}`);
      console.log(`  Location Match: ${score.breakdown.location}% - ${score.explanations.location}`);
      console.log(`  Company Match: ${score.breakdown.company_match}% - ${score.explanations.company_match}`);
      console.log('');
      console.log('💡 Rationale:');
      console.log(score.rationale);
      console.log('');
      console.log(jobId);
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Helper function to load job data from logs
async function loadJobData(jobId: string) {
  const logsDir = resolveFromProjectRoot('logs');
  const jobDir = path.join(logsDir, jobId);

  // 1. Local cache (fast path)
  const cacheFile = path.join(jobDir, 'job-cache.json');
  try {
    const content = await fs.readFile(cacheFile, 'utf-8');
    return JSON.parse(content);
  } catch {
    // Cache not found, try legacy
  }

  // 2. Legacy job-*.json (backward compat)
  try {
    const files = await fs.readdir(jobDir);
    const legacyFile = files.find(f => f.startsWith('job-') && f.endsWith('.json'));
    if (legacyFile) {
      const content = await fs.readFile(path.join(jobDir, legacyFile), 'utf-8');
      const data = JSON.parse(content);
      // Lazy migration: write cache file
      await fs.writeFile(cacheFile, JSON.stringify(data, null, 2), 'utf-8');
      return data;
    }
  } catch {
    // Directory doesn't exist or no legacy file
  }

  // 3. Google Sheets fallback
  const sheetsUrl = process.env.GOOGLE_SHEETS_URL;
  const sheetName = process.env.GOOGLE_SHEETS_SHEET_NAME || 'Sheet1';
  if (sheetsUrl) {
    try {
      const { GoogleSheetsClient, extractSpreadsheetId, sheetsRowToJobListing } = await import('./utils/google-sheets');
      const client = new GoogleSheetsClient();
      const spreadsheetId = extractSpreadsheetId(sheetsUrl);
      const row = await client.fetchJobById(spreadsheetId, sheetName, jobId);
      if (row) {
        const jobData = sheetsRowToJobListing(row);
        await fs.mkdir(jobDir, { recursive: true });
        await fs.writeFile(cacheFile, JSON.stringify(jobData, null, 2), 'utf-8');
        return jobData;
      }
    } catch (sheetsError) {
      console.warn(`⚠️  Sheets fallback failed: ${sheetsError instanceof Error ? sheetsError.message : 'Unknown'}`);
    }
  }

  throw new Error(`Job data not found for job ID: ${jobId}`);
}

program
  .command('resume')
  .description('Generate a tailored resume PDF for a specific job')
  .argument('<jobId>', 'Job ID to tailor resume for')
  .option('-n, --num-models <n>', 'Number of models to use from config (default: 1)', parseInt)
  .option('-c, --config <file>', 'Config file path (default: parallel-config.json)')
  .option('--no-critique', 'Skip critique workflow (faster)')
  .option('--skip-judge', 'Skip PDF judge validation')
  .option('--output <dir>', 'Output directory (default: RESUME_OUTPUT_DIR from .env)')
  .option('--regen', 'Rebuild PDFs from saved markdown without re-generating content')
  .option('--preview', 'Show pipeline stages without executing. Use: npm run dev -- resume <jobId> --preview')
  .action(async (jobId: string, options) => {
    try {
      const { ParallelResumeOrchestrator } = await import('./agents/parallel-resume-orchestrator');

      const cvFile = await findCvFile();
      const configPath = options.config ? path.resolve(options.config) : undefined;
      await maybeRefreshOpenRouterModels(configPath);
      const orchestrator = new ParallelResumeOrchestrator(configPath);

      if (options.regen) {
        await orchestrator.regenParallelResumes(jobId, options.output);
        return;
      }

      // Load job data
      const logsDir = resolveFromProjectRoot('logs');
      const jobDir = path.join(logsDir, jobId);

      if (!fss.existsSync(jobDir)) {
        throw new Error(`Job directory not found: ${jobDir}`);
      }

      const files = fss.readdirSync(jobDir);
      const jobFile = files.find((f: string) => f.startsWith('job-') && f.endsWith('.json'));

      if (!jobFile) {
        throw new Error(`No job file found in ${jobDir}`);
      }

      const jobData = JSON.parse(fss.readFileSync(path.join(jobDir, jobFile), 'utf-8'));

      const result = await orchestrator.generateParallelResumes(
        jobId,
        cvFile,
        jobData,
        {
          numModels: options.numModels ?? 1,
          skipCritique: !options.critique,
          skipJudge: options.skipJudge,
          outputDir: options.output,
          preview: !!options.preview,
        }
      );

      if (!options.preview && process.platform === 'darwin') {
        execSync(`open "${result.comparisonFolder}"`);
      }

    } catch (error) {
      console.error('\n❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('critique')
  .description('Critique a tailored resume for a specific job')
  .argument('<jobId>', 'Job ID to critique resume for (from the log filename)')
  .action(async (jobId: string) => {
    try {
      console.log('🔍 Analyzing resume...');
      console.log(`📊 Job ID: ${jobId}`);
      console.log('');

      const config = getResumeGenerationConfig();

      console.log('🔧 LLM Configuration:');
      console.log(`  Critique: ${config.critiqueProvider} / ${config.critiqueModel}`);
      console.log('');

      const critiqueProviderConfig: LLMProviderConfig = {
        provider: config.critiqueProvider,
        apiKey: config.critiqueApiKey,
        model: config.critiqueModel,
        maxTokens: config.maxTokens,
        temperature: config.temperature
      };

      const { ProviderFactory } = await import('./providers/provider-factory');
      const critiqueProvider = ProviderFactory.create(critiqueProviderConfig);
      const critic = new ResumeCriticAgent(critiqueProvider);
      
      const result = await critic.critiqueResume(jobId);
      
      if (result.success) {
        console.log('✅ Resume Critique Complete');
        console.log('=' .repeat(50));
        console.log(`📄 Resume: ${result.resumePath}`);
        console.log(`⭐ Overall Rating: ${result.overallRating}/10`);
        console.log('');
        
        if (result.strengths && result.strengths.length > 0) {
          console.log('💪 Strengths:');
          result.strengths.forEach((strength, index) => {
            console.log(`  ${index + 1}. ${strength}`);
          });
          console.log('');
        }
        
        if (result.weaknesses && result.weaknesses.length > 0) {
          console.log('⚠️  Areas for Improvement:');
          result.weaknesses.forEach((weakness, index) => {
            console.log(`  ${index + 1}. ${weakness}`);
          });
          console.log('');
        }
        
        if (result.recommendations && result.recommendations.length > 0) {
          console.log('💡 Recommendations:');
          result.recommendations.forEach((recommendation, index) => {
            console.log(`  ${index + 1}. ${recommendation}`);
          });
          console.log('');
        }
        
        if (result.detailedAnalysis) {
          console.log('📝 Detailed Analysis:');
          console.log(result.detailedAnalysis);
        }
      } else {
        console.error('❌ Resume critique failed:', result.error);
        process.exit(1);
      }
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// prep command moved to @inkredabull/career-catalyst-prep

program
  .command('outreach')
  .description('Find LinkedIn connections at target companies')
  .argument('<jobId>', 'Job ID to find connections for')
  .option('-a, --action <action>', 'Action: search (default) or list connections', 'search')
  .action(async (jobId: string, options) => {
    try {
      const outreachAgent = new OutreachAgent();
      const action = options.action;
      
      if (action === 'search') {
        console.log('🔍 Searching for LinkedIn connections...');
        console.log(`📊 Job ID: ${jobId}`);
        console.log('');
        
        const result = await outreachAgent.findConnections(jobId);
        
        if (result.success) {
          console.log('✅ LinkedIn Search Setup Complete');
          console.log('=' .repeat(50));
          console.log(`🏢 Company: ${result.company}`);
          console.log('📋 Follow the generated instructions to manually collect connection data');
          console.log('💡 Run "outreach list" after updating the connections template');
        } else {
          console.error(`❌ Outreach search failed: ${result.error}`);
          process.exit(1);
        }
      } else if (action === 'list') {
        console.log('📋 Loading LinkedIn connections...');
        console.log(`📊 Job ID: ${jobId}`);
        console.log('');
        
        const result = await outreachAgent.listConnections(jobId);
        
        if (result.success) {
          console.log('✅ LinkedIn Connections');
          console.log('=' .repeat(50));
          console.log(result.summary);
          
          if (result.connections && result.connections.length > 0) {
            console.log('\n📋 Connection Details:');
            console.log('-' .repeat(50));
            
            result.connections.forEach((connection, index) => {
              console.log(`\n${index + 1}. ${connection.name}`);
              console.log(`   Title: ${connection.title}`);
              console.log(`   Company: ${connection.company}`);
              console.log(`   Connection: ${connection.connectionDegree} degree`);
              if (connection.connectionDegree === '2nd' && connection.mutualConnection) {
                console.log(`   Through: ${connection.mutualConnection}`);
              }
              if (connection.location) {
                console.log(`   Location: ${connection.location}`);
              }
              console.log(`   Profile: ${connection.profileUrl}`);
            });
            
            console.log('\n💡 Use these connections for targeted outreach and networking');
          }
        } else {
          console.error(`❌ Failed to load connections: ${result.error}`);
          process.exit(1);
        }
      } else {
        console.error('❌ Invalid action. Use --action search or --action list');
        process.exit(1);
      }
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('metrics')
  .description('Extract 90-day and first-year KPIs from job description')
  .argument('<jobId>', 'Job ID to extract metrics for')
  .action(async (jobId: string) => {
    try {
      console.log('📊 Extracting performance metrics...');
      console.log(`📊 Job ID: ${jobId}`);
      console.log('');

      const anthropicConfig = getAnthropicConfig();
      const metricsAgent = new MetricsAgent(
        anthropicConfig.anthropicApiKey,
        anthropicConfig.model,
        anthropicConfig.maxTokens
      );
      
      const result = await metricsAgent.extractMetrics(jobId);
      
      if (result.success) {
        console.log('✅ Metrics extraction complete');
        console.log(`📄 Results saved to logs/${jobId}/metrics-*.json`);
      } else {
        console.error(`❌ Metrics extraction failed: ${result.error}`);
        process.exit(1);
      }
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// WhoGotHired Agent Commands
program
  .command('whogothired')
  .description('Check Gmail rejections and track who got hired on LinkedIn')
  .action(async () => {
    try {
      console.log('🔍 Running WhoGotHired Agent...');
      
      const config = getConfig();
      const agent = new WhoGotHiredAgent(config);
      
      await agent.run();
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('whogothired:status')
  .description('Show WhoGotHired tracking status and statistics')
  .action(async () => {
    try {
      const config = getConfig();
      const agent = new WhoGotHiredAgent(config);
      
      await agent.status();
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('whogothired:check')
  .description('Force check LinkedIn for a specific company and job title')
  .argument('<company>', 'Company name to check')
  .argument('<jobTitle>', 'Job title to check')
  .action(async (company: string, jobTitle: string) => {
    try {
      console.log(`🔍 Force checking: ${company} - ${jobTitle}`);
      
      const config = getConfig();
      const agent = new WhoGotHiredAgent(config);
      
      await agent.forceCheck(company, jobTitle);
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('whogothired:list')
  .description('List all pending LinkedIn checks')
  .action(async () => {
    try {
      const config = getConfig();
      const agent = new WhoGotHiredAgent(config);
      
      await agent.listPendingChecks();
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('whogothired:report')
  .description('Report who got hired for a specific rejection')
  .argument('<rejectionId>', 'Rejection ID from the tracker')
  .argument('<name>', 'Name of the person who got hired')
  .argument('<title>', 'Job title of the hired person')
  .option('--linkedin <url>', 'LinkedIn URL of the hired person')
  .option('--start-date <date>', 'Start date of the hired person (YYYY-MM-DD)')
  .action(async (rejectionId: string, name: string, title: string, options: { linkedin?: string, startDate?: string }) => {
    try {
      console.log(`🎯 Reporting hire: ${name} for rejection ${rejectionId}`);
      
      const config = getConfig();
      const agent = new WhoGotHiredAgent(config);
      
      await agent.reportHire(rejectionId, name, title, options.linkedin, options.startDate);
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('whogothired:giveup')
  .description('Give up searching for who got hired for a specific rejection')
  .argument('<rejectionId>', 'Rejection ID from the tracker')
  .option('--reason <reason>', 'Reason for giving up (optional)')
  .action(async (rejectionId: string, options: { reason?: string }) => {
    try {
      console.log(`⏹️ Giving up search for rejection ${rejectionId}`);
      
      const config = getConfig();
      const agent = new WhoGotHiredAgent(config);
      
      await agent.giveUpSearch(rejectionId, options.reason);
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('reminder')
  .description('Create a local macOS reminder')
  .option('--title <title>', 'Reminder title (required)')
  .option('--notes <notes>', 'Reminder notes/description')
  .option('--priority <priority>', 'Priority (1=High, 5=Medium, 9=Low)', '5')
  .option('--list <list>', 'Reminder list name', 'Reminders')
  .option('--due <date>', 'Due date (YYYY-MM-DD format)')
  .action(async (options) => {
    try {
      if (!options.title) {
        console.error('❌ Error: --title is required');
        process.exit(1);
      }

      console.log('📝 Creating macOS reminder...');
      console.log(`📌 Title: ${options.title}`);
      console.log(`📋 List: ${options.list}`);
      console.log(`⭐ Priority: ${options.priority}`);

      if (options.notes) {
        console.log(`📄 Notes: ${options.notes.substring(0, 100)}${options.notes.length > 100 ? '...' : ''}`);
      }

      // Import MacOSReminderService dynamically
      // @ts-ignore - Optional dependency, may not be available
      const { MacOSReminderService } = await import('@inkredabull/macos-reminder');
      
      const reminderService = new MacOSReminderService();
      
      const reminderData: any = {
        title: options.title,
        priority: parseInt(options.priority) || 5,
        list: options.list
      };
      
      if (options.notes) {
        reminderData.notes = options.notes;
      }
      
      if (options.due) {
        reminderData.dueDate = options.due; // Keep as string format
      }

      await reminderService.createReminder(reminderData);
      
      console.log('✅ Reminder created successfully!');
      
    } catch (error) {
      console.error('❌ Error creating reminder:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program.parse();
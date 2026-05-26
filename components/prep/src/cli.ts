#!/usr/bin/env node

import { Command } from 'commander';
import { InterviewPrepAgent } from './agents/interview-prep-agent';
import { StatementType, AboutMeSection } from './types';
import { getAnthropicConfig } from '@inkredabull/career-catalyst-core';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fss from 'fs';
import { execSync } from 'child_process';
import * as readline from 'readline';

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

  throw new Error('CV file not found. Please create a cv.txt file in the current directory or specify the path.');
}

function unescapeRTF(content: string): string {
  return content
    .replace(/\\\\/g, '\\')
    .replace(/\\{/g, '{')
    .replace(/\\}/g, '}');
}

async function copyToClipboard(content: string): Promise<void> {
  let processedContent = content;
  if (content.includes('\\\\rtf1') || content.includes('\\\\par')) {
    processedContent = unescapeRTF(content);
    console.log('📝 Unescaped RTF formatting for proper clipboard copying');
  }
  execSync('pbcopy', { input: processedContent });
}

async function interactiveAboutMeGeneration(jobId: string, options: any): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(query, resolve);
    });
  };

  try {
    const config = getAnthropicConfig();
    const interviewPrepAgent = new InterviewPrepAgent(
      config.anthropicApiKey,
      config.model,
      config.maxTokens
    );
    const cvFile = await findCvFile();

    const materialOptions = {
      emphasis: options.emphasis,
      companyInfo: options.companyInfo,
      customInstructions: options.instructions,
      person: options.person as 'first' | 'third'
    };

    const sectionNames: Record<AboutMeSection, string> = {
      'hook': 'Hook (identity, power statement, differentiator)',
      'career-snapshot': 'Career Snapshot (arc, skills, achievement)',
      'themes': 'Key Themes with Examples',
      'why': 'Why This Role & Company',
      'focus-story': 'Focus Story (STAR)',
      'close': 'Close with Confidence',
      'personal-touch': 'Personal Touch (optional)',
      'questions': 'Questions to Ask the Interviewer'
    };

    // eslint-disable-next-line no-constant-condition
    while (true) {
      console.log('\n' + '='.repeat(60));
      console.log('📝 About-Me Section Manager');
      console.log('='.repeat(60));
      console.log(`Job ID: ${jobId}`);
      console.log('');

      const sections: AboutMeSection[] = ['hook', 'career-snapshot', 'themes', 'why', 'focus-story', 'close', 'personal-touch', 'questions'];
      console.log('Section Status:');
      for (const section of sections) {
        const sectionData = interviewPrepAgent.loadSection(jobId, section);
        const status = sectionData ? '✅' : '❌';
        console.log(`  ${status} ${sectionNames[section]}`);
      }
      console.log('');

      console.log('Options:');
      console.log('  1. Generate all sections');
      console.log('  2. Generate specific section');
      console.log('  3. Regenerate specific section');
      console.log('  4. Critique specific section');
      console.log('  5. Refine section (edit and improve)');
      console.log('  6. View section content');
      console.log('  7. Combine sections into final output');
      console.log('  8. Exit');
      console.log('');

      const choice = await question('Select an option (1-8): ');

      if (choice === '1') {
        console.log('\n📝 Generating all sections...');
        const result = await interviewPrepAgent.generateMaterial(
          'about-me',
          jobId,
          cvFile,
          materialOptions,
          false,
          false
        );
        if (result.success) {
          console.log('✅ All sections generated successfully');
          if (result.content) {
            await copyToClipboard(result.content);
            console.log('📋 Combined content copied to clipboard');
          }
        } else {
          console.error(`❌ Generation failed: ${result.error}`);
        }
      } else if (choice === '2' || choice === '3') {
        console.log('\nSelect section to generate:');
        sections.forEach((section, index) => {
          console.log(`  ${index + 1}. ${sectionNames[section]}`);
        });
        const sectionChoice = await question('\nEnter section number: ');
        const sectionIndex = parseInt(sectionChoice) - 1;
        if (sectionIndex >= 0 && sectionIndex < sections.length) {
          const section = sections[sectionIndex];
          console.log(`\n📝 ${choice === '3' ? 'Regenerating' : 'Generating'} ${sectionNames[section]}...`);
          const result = await interviewPrepAgent.generateSection(
            section,
            jobId,
            cvFile,
            materialOptions,
            choice === '3'
          );
          if (result.success) {
            console.log(`✅ ${sectionNames[section]} ${choice === '3' ? 'regenerated' : 'generated'} successfully`);
          } else {
            console.error(`❌ Failed: ${result.error}`);
          }
        } else {
          console.error('❌ Invalid section number');
        }
      } else if (choice === '4') {
        console.log('\nSelect section to critique:');
        sections.forEach((section, index) => {
          console.log(`  ${index + 1}. ${sectionNames[section]}`);
        });
        const sectionChoice = await question('\nEnter section number: ');
        const sectionIndex = parseInt(sectionChoice) - 1;
        if (sectionIndex >= 0 && sectionIndex < sections.length) {
          const section = sections[sectionIndex];
          console.log(`\n🔍 Critiquing ${sectionNames[section]}...`);
          const result = await interviewPrepAgent.critiqueSection(jobId, section, cvFile);
          if (result.success) {
            console.log('\n' + '='.repeat(60));
            console.log(`📊 Critique: ${sectionNames[section]}`);
            console.log('='.repeat(60));
            if (result.rating) console.log(`\n⭐ Rating: ${result.rating}/10`);
            if (result.strengths && result.strengths.length > 0) {
              console.log('\n💪 Strengths:');
              result.strengths.forEach((s: string, i: number) => console.log(`  ${i + 1}. ${s}`));
            }
            if (result.weaknesses && result.weaknesses.length > 0) {
              console.log('\n⚠️  Weaknesses:');
              result.weaknesses.forEach((w: string, i: number) => console.log(`  ${i + 1}. ${w}`));
            }
            if (result.recommendations && result.recommendations.length > 0) {
              console.log('\n💡 Recommendations:');
              result.recommendations.forEach((r: string, i: number) => console.log(`  ${i + 1}. ${r}`));
            }
            if (result.detailedAnalysis) {
              console.log('\n📝 Detailed Analysis:');
              console.log(result.detailedAnalysis);
            }
          } else {
            console.error(`❌ Critique failed: ${result.error}`);
          }
        } else {
          console.error('❌ Invalid section number');
        }
      } else if (choice === '5') {
        console.log('\nSelect section to refine:');
        sections.forEach((section, index) => {
          console.log(`  ${index + 1}. ${sectionNames[section]}`);
        });
        const sectionChoice = await question('\nEnter section number: ');
        const sectionIndex = parseInt(sectionChoice) - 1;
        if (sectionIndex >= 0 && sectionIndex < sections.length) {
          const section = sections[sectionIndex];
          const sectionData = interviewPrepAgent.loadSection(jobId, section);
          if (!sectionData) {
            console.error(`❌ Section ${sectionNames[section]} not found. Generate it first.`);
          } else {
            console.log(`\n📝 Current ${sectionNames[section]} content:`);
            console.log('='.repeat(60));
            const readableContent = sectionData.content.replace(/\\[a-z]+\d*\s?/gi, ' ').replace(/\{[^}]*\}/g, '').trim();
            console.log(readableContent.substring(0, 500) + (readableContent.length > 500 ? '...' : ''));
            console.log('='.repeat(60));
            console.log('\n💡 Edit the content above, then paste it here (or press Enter to skip):');
            const editedContent = await question('\nEdited content: ');
            if (editedContent.trim()) {
              console.log('\n🔧 Refining section...');
              const result = await (interviewPrepAgent as any).refineSection(jobId, section, editedContent, cvFile);
              if (result.success) {
                console.log(`✅ ${sectionNames[section]} refined successfully`);
              } else {
                console.error(`❌ Refinement failed: ${result.error}`);
              }
            }
          }
        } else {
          console.error('❌ Invalid section number');
        }
      } else if (choice === '6') {
        console.log('\nSelect section to view:');
        sections.forEach((section, index) => {
          console.log(`  ${index + 1}. ${sectionNames[section]}`);
        });
        const sectionChoice = await question('\nEnter section number: ');
        const sectionIndex = parseInt(sectionChoice) - 1;
        if (sectionIndex >= 0 && sectionIndex < sections.length) {
          const section = sections[sectionIndex];
          const sectionData = interviewPrepAgent.loadSection(jobId, section);
          if (sectionData) {
            console.log(`\n📄 ${sectionNames[section]}:`);
            console.log('='.repeat(60));
            console.log(sectionData.content);
            console.log('='.repeat(60));
          } else {
            console.error(`❌ Section ${sectionNames[section]} not found`);
          }
        } else {
          console.error('❌ Invalid section number');
        }
      } else if (choice === '7') {
        console.log('\n🔗 Combining sections...');
        try {
          const combined = await interviewPrepAgent.combineSections(jobId);
          await copyToClipboard(combined);
          console.log('✅ Sections combined and copied to clipboard');
        } catch (error) {
          console.error(`❌ Failed to combine: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else if (choice === '8') {
        console.log('\n👋 Exiting...');
        break;
      } else {
        console.error('❌ Invalid option');
      }
    }
  } finally {
    rl.close();
  }
}

const program = new Command();

program
  .name('career-catalyst-prep')
  .description('Interview preparation materials — about-me, focus story, themes, cover letter, and endorsement generation')
  .version('1.0.0');

program
  .command('prep')
  .description('Generate interview preparation materials (cover letter, endorsement, interview, general)')
  .argument('<type>', 'Type of statement: cover-letter, endorsement, interview, focus, about-me, general, themes, stories, profile, project, or list-projects')
  .argument('[jobId]', 'Job ID to generate statement for (not required for profile)')
  .argument('[projectNumber]', 'Project number to extract (for project type only)')
  .option('-e, --emphasis <text>', 'Special emphasis or instructions for the material')
  .option('-c, --company-info <text>', 'Additional company information (for about-me materials)')
  .option('-i, --instructions <text>', 'Custom instructions for the material')
  .option('-p, --person <person>', 'Writing perspective: first (I/me) or third (he/Anthony)', 'first')
  .option('--company-url <url>', 'Company website URL for company values research (skips interactive prompt)')
  .option('--content', 'Output only the material content without formatting')
  .option('--regen', 'Force regenerate material (ignores cached content)')
  .option('--interactive', 'Interactive mode for about-me: select sections to generate, critique, or refine')
  .action(async (type: string, jobId: string, projectNumber: string, options) => {
    try {
      if (type === 'themes') {
        if (!jobId) {
          console.error('❌ Job ID is required for themes extraction');
          process.exit(1);
        }
        console.log('🎯 Extracting priority themes...');
        console.log(`📊 Job ID: ${jobId}`);
        console.log('');

        const config = getAnthropicConfig();
        const interviewPrepAgent = new InterviewPrepAgent(config.anthropicApiKey, config.model, config.maxTokens);
        const result = await interviewPrepAgent.extractThemes(jobId);

        if (result.success) {
          console.log('\n✅ Theme Extraction Complete');
        } else {
          console.error(`❌ Theme extraction failed: ${result.error}`);
          process.exit(1);
        }
        return;
      }

      if (type === 'stories') {
        if (!jobId) {
          console.error('❌ Job ID is required for stories extraction');
          process.exit(1);
        }
        console.log('📚 Extracting interview stories...');
        console.log(`📊 Job ID: ${jobId}`);
        console.log('');

        const config = getAnthropicConfig();
        const interviewPrepAgent = new InterviewPrepAgent(config.anthropicApiKey, config.model, config.maxTokens);
        const result = await interviewPrepAgent.getInterviewStories(jobId);

        if (result.success) {
          console.log('✅ Interview Stories Retrieved');
          console.log('='.repeat(50));

          if (result.highlightedExamples && result.highlightedExamples.length > 0) {
            console.log('\n🌟 Highlighted Professional Impact Examples:');
            result.highlightedExamples.forEach((example, index) => {
              console.log(`\n${index + 1}. ${example.text}`);
              console.log(`   Source: ${example.source}`);
              console.log(`   Impact: ${example.impact}`);
            });
          }

          if (result.stories && result.stories.length > 0) {
            console.log('\n📖 Interview Story Suggestions:');
            result.stories.forEach((story, index) => {
              console.log(`\n${index + 1}. ${story}`);
            });
          }

          if ((!result.stories || result.stories.length === 0) &&
              (!result.highlightedExamples || result.highlightedExamples.length === 0)) {
            console.log('\n💡 No stories found. Run "prep about-me" first to generate interview stories.');
          }
        } else {
          console.error(`❌ Story extraction failed: ${result.error}`);
          process.exit(1);
        }
        return;
      }

      if (type === 'profile') {
        console.log('👤 Generating profile and Google Apps Script...');
        console.log('');

        const config = getAnthropicConfig();
        const interviewPrepAgent = new InterviewPrepAgent(config.anthropicApiKey, config.model, config.maxTokens);
        const result = await interviewPrepAgent.createProfile();

        if (result.success) {
          console.log('✅ Profile Generation Complete');
          console.log('='.repeat(50));
          console.log('\n📝 Generated Profile:');
          console.log(result.profile);
          console.log('\n📄 Google Apps Script generated and saved to logs/');
          console.log('💡 Copy the .js file content to Google Apps Script for use in Sheets');
        } else {
          console.error(`❌ Profile generation failed: ${result.error}`);
          process.exit(1);
        }
        return;
      }

      if (type === 'list-projects') {
        if (!jobId) {
          console.error('❌ Job ID is required for listing projects');
          process.exit(1);
        }
        console.log('📋 Listing available projects...');
        console.log(`📊 Job ID: ${jobId}`);
        console.log('');

        const config = getAnthropicConfig();
        const interviewPrepAgent = new InterviewPrepAgent(config.anthropicApiKey, config.model, config.maxTokens);
        const result = await interviewPrepAgent.listAvailableProjects(jobId);

        if (result.success) {
          console.log('✅ Available Projects');
          console.log('='.repeat(50));
          console.log(`\n📊 Found ${result.count} projects:`);
          result.projects?.forEach(project => {
            console.log(`   ${project}`);
          });
          console.log('\n💡 Use: prep project <jobId> <projectNumber> to extract a specific project');
        } else {
          console.error(`❌ Project listing failed: ${result.error}`);
          process.exit(1);
        }
        return;
      }

      if (type === 'project') {
        if (!jobId) {
          console.error('❌ Job ID is required for project extraction');
          process.exit(1);
        }

        let projectNum = 1;
        if (projectNumber) {
          projectNum = parseInt(projectNumber, 10);
        }

        if (isNaN(projectNum) || projectNum < 1) {
          console.error('❌ Invalid project number. Provide project number as: prep project <jobId> <projectNumber>');
          process.exit(1);
        }

        console.log('📋 Extracting project information...');
        console.log(`📊 Job ID: ${jobId}`);
        console.log(`🔢 Project: ${projectNum}`);
        console.log('');

        const config = getAnthropicConfig();
        const interviewPrepAgent = new InterviewPrepAgent(config.anthropicApiKey, config.model, config.maxTokens);
        const result = await interviewPrepAgent.extractProject(jobId, projectNum);

        if (result.success) {
          console.log('✅ Project Extraction Complete');
          console.log('='.repeat(50));
          console.log('\n📋 Copy-Paste Ready Format:');
          console.log('='.repeat(30));
          console.log(result.formattedOutput);
          console.log('='.repeat(30));
          console.log('\n💡 Copy the above text and paste into your Catalant modal form');
        } else {
          console.error(`❌ Project extraction failed: ${result.error}`);
          process.exit(1);
        }
        return;
      }

      if (type === 'focus') {
        console.log('ℹ️  "focus" is now an alias for "interview" (focus story is included within interview prep)');
        type = 'interview';
      }

      if (type === 'interview') {
        if (!jobId) {
          console.error('❌ Job ID is required for interview generation');
          process.exit(1);
        }

        const cvFile = await findCvFile();

        if (!options.content) {
          console.log('🎙️ Generating comprehensive interview preparation...');
          console.log(`📊 Job ID: ${jobId}`);
          console.log(`📋 CV File: ${cvFile}`);
        }

        const config = getAnthropicConfig();
        const interviewPrepAgent = new InterviewPrepAgent(config.anthropicApiKey, config.model, config.maxTokens);

        const materialOptions = {
          emphasis: options.emphasis,
          companyInfo: options.companyInfo,
          customInstructions: options.instructions
        };

        const result = await interviewPrepAgent.generateInterviewPrep(
          jobId,
          cvFile,
          materialOptions,
          !!options.regen,
          !!options.content
        );

        if (result.success) {
          if (options.content) {
            console.log(result.aboutMeContent || '');
          } else {
            console.log('✅ Interview Preparation Complete');
            console.log('='.repeat(50));

            if (result.aboutMeContent) {
              await copyToClipboard(result.aboutMeContent);
              console.log('📋 Comprehensive interview content copied to clipboard in Rich Text Format');
              console.log('    • Professional Summary (3-5 bullet points)');
              console.log('    • Focus Story (STAR method)');
              console.log('    • Key Themes with examples');
              console.log(`    • Why ${jobId.substring(0, 8)}... company fit`);
            }

            if (result.companyRubricGenerated) {
              console.log('📊 Company evaluation rubric generated: company-rubric.txt');
            }

            console.log('💡 Ready to paste into documents, emails, or notes');
          }
        } else {
          console.error(`❌ Interview preparation failed: ${result.error}`);
          process.exit(1);
        }
        return;
      }

      const validTypes: StatementType[] = ['cover-letter', 'endorsement', 'about-me', 'general'];
      if (!validTypes.includes(type as StatementType)) {
        console.error(`❌ Invalid material type: ${type}`);
        console.error(`Valid types: ${validTypes.join(', ')}, interview, focus (alias for interview), themes, stories, profile, project, list-projects`);
        process.exit(1);
      }

      if (!jobId) {
        console.error(`❌ Job ID is required for ${type} generation`);
        process.exit(1);
      }

      if (type === 'about-me' && options.interactive) {
        await interactiveAboutMeGeneration(jobId, options);
        return;
      }

      const cvFile = await findCvFile();

      if (!options.content) {
        console.log('📝 Generating interview material...');
        console.log(`📊 Type: ${type}`);
        console.log(`📊 Job ID: ${jobId}`);
        console.log(`📋 CV File: ${cvFile}`);
      }

      const config = getAnthropicConfig();
      const interviewPrepAgent = new InterviewPrepAgent(config.anthropicApiKey, config.model, config.maxTokens);

      if (options.person && !['first', 'third'].includes(options.person)) {
        console.error(`❌ Invalid person option: ${options.person}`);
        console.error('Valid options: first, third');
        process.exit(1);
      }

      const materialOptions = {
        emphasis: options.emphasis,
        companyInfo: options.companyInfo,
        customInstructions: options.instructions,
        person: options.person as 'first' | 'third',
        companyUrl: options.companyUrl
      };

      const result = await interviewPrepAgent.generateMaterial(
        type as StatementType,
        jobId,
        cvFile,
        materialOptions,
        !!options.regen,
        !!options.content
      );

      if (result.success) {
        if (options.content) {
          console.log(result.content);
        } else if (result.type === 'about-me') {
          console.log('✅ About Me Generation Complete (with Focus Story)');
          console.log('='.repeat(50));
          console.log(`📝 Type: ABOUT ME`);
          console.log(`📊 Character Count: ${result.characterCount}`);
          console.log('');

          if (result.content) {
            await copyToClipboard(result.content);
          }

          console.log('📋 About me content copied to clipboard in Rich Text Format');
          console.log('💡 Ready to paste into documents, emails, or notes');
        } else {
          console.log('✅ Interview Material Generation Complete');
          console.log('='.repeat(50));
          console.log(`📝 Type: ${result.type.replace('-', ' ').toUpperCase()}`);
          console.log(`📊 Character Count: ${result.characterCount}`);
          console.log('');
          console.log('📄 Generated Material:');
          console.log(result.content);
        }
      } else {
        console.error(`❌ Interview material generation failed: ${result.error}`);
        process.exit(1);
      }

    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Individual section commands for granular about-me management
const sectionCommands: Record<string, AboutMeSection> = {
  'about-me-hook': 'hook',
  'about-me-career-snapshot': 'career-snapshot',
  'about-me-themes': 'themes',
  'about-me-why': 'why',
  'about-me-focus-story': 'focus-story',
  'about-me-close': 'close',
  'about-me-personal-touch': 'personal-touch',
  'about-me-questions': 'questions'
};

for (const [commandName, section] of Object.entries(sectionCommands)) {
  program
    .command(commandName)
    .description(`Generate or manage the ${section} section of about-me statement`)
    .argument('<jobId>', 'Job ID to generate section for')
    .option('-e, --emphasis <text>', 'Special emphasis or instructions')
    .option('-c, --company-info <text>', 'Additional company information')
    .option('-i, --instructions <text>', 'Custom instructions')
    .option('--regen', 'Force regenerate section')
    .option('--critique', 'Critique the section')
    .option('--view', 'View the section content')
    .action(async (jobId: string, options) => {
      try {
        const cvFile = await findCvFile();
        const config = getAnthropicConfig();
        const interviewPrepAgent = new InterviewPrepAgent(config.anthropicApiKey, config.model, config.maxTokens);

        const materialOptions = {
          emphasis: options.emphasis,
          companyInfo: options.companyInfo,
          customInstructions: options.instructions
        };

        if (options.view) {
          const sectionData = interviewPrepAgent.loadSection(jobId, section);
          if (sectionData) {
            console.log(`\n📄 ${section} Section:`);
            console.log('='.repeat(60));
            console.log(sectionData.content);
            console.log('='.repeat(60));
          } else {
            console.error(`❌ Section ${section} not found. Generate it first.`);
            process.exit(1);
          }
        } else if (options.critique) {
          console.log(`\n🔍 Critiquing ${section} section...`);
          const result = await interviewPrepAgent.critiqueSection(jobId, section, cvFile);
          if (result.success) {
            console.log('\n' + '='.repeat(60));
            console.log(`📊 Critique: ${section}`);
            console.log('='.repeat(60));
            if (result.rating) console.log(`\n⭐ Rating: ${result.rating}/10`);
            if (result.strengths && result.strengths.length > 0) {
              console.log('\n💪 Strengths:');
              result.strengths.forEach((s: string, i: number) => console.log(`  ${i + 1}. ${s}`));
            }
            if (result.weaknesses && result.weaknesses.length > 0) {
              console.log('\n⚠️  Weaknesses:');
              result.weaknesses.forEach((w: string, i: number) => console.log(`  ${i + 1}. ${w}`));
            }
            if (result.recommendations && result.recommendations.length > 0) {
              console.log('\n💡 Recommendations:');
              result.recommendations.forEach((r: string, i: number) => console.log(`  ${i + 1}. ${r}`));
            }
            if (result.detailedAnalysis) {
              console.log('\n📝 Detailed Analysis:');
              console.log(result.detailedAnalysis);
            }
          } else {
            console.error(`❌ Critique failed: ${result.error}`);
            process.exit(1);
          }
        } else {
          console.log(`📝 Generating ${section} section...`);
          const result = await interviewPrepAgent.generateSection(
            section,
            jobId,
            cvFile,
            materialOptions,
            !!options.regen
          );
          if (result.success) {
            console.log(`✅ ${section} section generated successfully`);
            if (result.content) {
              await copyToClipboard(result.content);
              console.log('📋 Section content copied to clipboard');
            }
          } else {
            console.error(`❌ Generation failed: ${result.error}`);
            process.exit(1);
          }
        }
      } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

program.parse();

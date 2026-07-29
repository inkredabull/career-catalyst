#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { program } = require('commander');

// Parse command line arguments
program
  .option('-d, --days <days>', 'Number of days after which to archive jobs', '30')
  .option('--dry-run', 'Show what would be archived without actually moving files')
  .option('--logs-dir <path>', 'Path to the logs directory', 'logs')
  .option('--archive-dir <path>', 'Path to the archive directory', 'archive')
  .parse(process.argv);

const options = program.opts();
const days = parseInt(options.days, 10);
const logsDir = path.resolve(process.cwd(), options.logsDir);
const archiveDir = path.resolve(process.cwd(), options.archiveDir);

// Directories to exclude from archiving
const EXCLUDED_DIRS = ['ama-chats', 'general'];

// Ensure archive directory exists
if (!fs.existsSync(archiveDir)) {
  console.log(`Creating archive directory: ${archiveDir}`);
  if (!options.dryRun) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }
}

// Check if logs directory exists
if (!fs.existsSync(logsDir)) {
  console.error(`Error: Logs directory not found at ${logsDir}`);
  process.exit(1);
}

// Function to get directories in a path
function getDirectories(source) {
  return fs.readdirSync(source, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
}

// Function to get the modification time of a file/directory
function getModificationTime(filePath) {
  const stats = fs.statSync(filePath);
  return stats.mtime;
}

// Function to check if a directory is a job directory (based on naming pattern)
function isJobDir(dirName) {
  return /^[0-9a-f]{8}$/.test(dirName) && 
         !EXCLUDED_DIRS.includes(dirName) &&
         dirName !== 'archive';
}

// Main function to archive old jobs
function archiveOldJobs() {
  console.log(`Archiving jobs older than ${days} days...`);
  console.log(`Logs directory: ${logsDir}`);
  console.log(`Archive directory: ${archiveDir}`);
  
  const jobDirs = getDirectories(logsDir).filter(isJobDir);
  const now = new Date();
  const cutoffDate = new Date(now);
  cutoffDate.setDate(now.getDate() - days);
  
  let archivedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  console.log(`\nFound ${jobDirs.length} job directories to check...`);
  
  for (const jobDir of jobDirs) {
    const jobPath = path.join(logsDir, jobDir);
    const destPath = path.join(archiveDir, jobDir);
    
    try {
      const modTime = getModificationTime(jobPath);
      
      if (modTime < cutoffDate) {
        console.log(`\n📦 Archiving: ${jobDir} (last modified: ${modTime.toISOString()})`);
        
        if (options.dryRun) {
          console.log(`   [DRY RUN] Would move: ${jobPath} -> ${destPath}`);
        } else {
          // Remove stale destination if it exists (e.g. from a previous partial run)
          if (fs.existsSync(destPath)) {
            fs.rmSync(destPath, { recursive: true, force: true });
          }
          fs.cpSync(jobPath, destPath, { recursive: true });
          fs.rmSync(jobPath, { recursive: true, force: true });
          console.log(`   Moved to archive: ${destPath}`);
        }
        archivedCount++;
      } else {
        if (options.verbose) {
          console.log(`   Keeping: ${jobDir} (modified ${Math.ceil((now - modTime) / (1000 * 60 * 60 * 24))} days ago)`);
        }
        skippedCount++;
      }
    } catch (error) {
      console.error(`   ❌ Error processing ${jobDir}: ${error.message}`);
      errorCount++;
    }
  }
  
  console.log('\n📊 Archiving Summary:');
  console.log(`✅ Archived: ${archivedCount} job directories`);
  console.log(`⏭️  Skipped: ${skippedCount} job directories (not old enough)`);
  if (errorCount > 0) {
    console.log(`❌ Errors: ${errorCount} job directories had errors`);
  }
  
  if (options.dryRun) {
    console.log('\n⚠️  DRY RUN: No files were actually moved');
  }
}

// Run the archiving process
try {
  archiveOldJobs();
} catch (error) {
  console.error('\n❌ Error during archiving:', error.message);
  process.exit(1);
}

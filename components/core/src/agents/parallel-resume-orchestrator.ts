import { ResumeClassifierAgent } from './classifier';
import { ResumeGeneratorAgent, GeneratorResult } from './generator';
import { JobListing } from '../types';
import { LLMProviderConfig } from '../providers/llm-provider';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import readline from 'readline';

export interface ParallelConfig {
  models: Array<{
    label: string;
    provider: 'anthropic' | 'openai' | 'openrouter';
    model: string;
    maxTokens: number;
  }>;
  sharedSettings: {
    maxRoles: number;
    temperature: number;
    mode: 'builder' | 'leader';
    experienceFormat: 'standard' | 'split';
  };
}

export interface ParallelResumeOptions {
  numModels?: number;
  skipCritique?: boolean;
  skipJudge?: boolean;
  outputDir?: string;
  preview?: boolean;
}

export interface ModelResult {
  model: string;
  success: boolean;
  cost?: number;
  duration?: number;
  pdfPath?: string;
  error?: string;
}

export interface ParallelResumeResult {
  jobId: string;
  company: string;
  role: string;
  timestamp: string;
  comparisonFolder: string;
  results: ModelResult[];
  totalCost: number;
  classificationCost: number;
  successCount: number;
  failureCount: number;
}

/**
 * Orchestrates parallel resume generation across multiple LLM models
 *
 * Architecture:
 * 1. Runs classifier once (Haiku 4.5) - shared across all models
 * 2. Spawns multiple generators in parallel with different models
 * 3. Organizes PDFs in timestamped comparison folders
 * 4. Tracks costs and generates comparison metadata
 */
export class ParallelResumeOrchestrator {
  private config: ParallelConfig;
  private classifierApiKey: string;

  constructor(configPath?: string) {
    const resolvedPath = configPath || path.join(process.cwd(), 'parallel-config.json');

    // Try to load config file, fall back to .env if not found
    if (fs.existsSync(resolvedPath)) {
      console.log(`📋 Loading config from: ${path.basename(resolvedPath)}`);
      const configContent = fs.readFileSync(resolvedPath, 'utf-8');
      this.config = JSON.parse(configContent);
    } else {
      console.log('📋 No parallel-config.json found, generating from .env settings');
      this.config = this.generateConfigFromEnv();
    }

    // Validate configuration
    this.validateConfig();

    // Get API key for classifier (uses Anthropic)
    this.classifierApiKey = process.env.ANTHROPIC_API_KEY || '';
    if (!this.classifierApiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable not set (required for classifier)');
    }
  }

  /**
   * Generate default configuration from environment variables
   * Uses RESUME_LLM_* and CRITIQUE_LLM_* settings from .env
   */
  private generateConfigFromEnv(): ParallelConfig {
    const resumeProvider = process.env.RESUME_LLM_PROVIDER as 'anthropic' | 'openai' | undefined;
    const resumeModel = process.env.RESUME_LLM_MODEL;
    const critiqueProvider = process.env.CRITIQUE_LLM_PROVIDER as 'anthropic' | 'openai' | undefined;
    const critiqueModel = process.env.CRITIQUE_LLM_MODEL;

    if (!resumeProvider || !resumeModel) {
      throw new Error(
        'RESUME_LLM_PROVIDER and RESUME_LLM_MODEL environment variables are required when parallel-config.json is not present.\n\n' +
        'Add to your .env file:\n' +
        '  RESUME_LLM_PROVIDER=anthropic  # or "openai"\n' +
        '  RESUME_LLM_MODEL=claude-sonnet-4-5-20250929\n' +
        '  CRITIQUE_LLM_PROVIDER=anthropic\n' +
        '  CRITIQUE_LLM_MODEL=claude-sonnet-4-5-20250929\n\n' +
        'Or create a parallel-config.json file for custom model configurations.'
      );
    }

    const models: ParallelConfig['models'] = [
      {
        label: this.getModelLabel(resumeProvider, resumeModel),
        provider: resumeProvider,
        model: resumeModel,
        maxTokens: resumeProvider === 'anthropic' ? 8000 : 4000
      }
    ];

    // Add critique model if different from resume model
    if (critiqueProvider && critiqueModel &&
        (critiqueProvider !== resumeProvider || critiqueModel !== resumeModel)) {
      models.push({
        label: this.getModelLabel(critiqueProvider, critiqueModel),
        provider: critiqueProvider,
        model: critiqueModel,
        maxTokens: critiqueProvider === 'anthropic' ? 8000 : 4000
      });
    }

    console.log(`   Configured ${models.length} model(s) from .env:`);
    models.forEach((m, i) => console.log(`   ${i + 1}. ${m.label} (${m.provider})`));

    return {
      models,
      sharedSettings: {
        maxRoles: 4,
        temperature: 0.3,
        mode: 'leader',
        experienceFormat: 'standard'
      }
    };
  }

  /**
   * Generate human-readable label from model identifier
   */
  private getModelLabel(provider: string, model: string): string {
    // Claude models
    if (model.includes('sonnet')) return 'Claude Sonnet 4.5';
    if (model.includes('haiku')) return 'Claude Haiku 4.5';
    if (model.includes('opus')) return 'Claude Opus 4.5';

    // OpenAI models
    if (model === 'gpt-4o') return 'GPT-4o';
    if (model === 'gpt-4o-mini') return 'GPT-4o-mini';
    if (model.startsWith('gpt-5')) return 'GPT-5';
    if (model.startsWith('o1')) return 'OpenAI o1';
    if (model.startsWith('o3')) return 'OpenAI o3';

    // Fallback: capitalize provider + truncated model
    return `${provider.charAt(0).toUpperCase() + provider.slice(1)} (${model.slice(0, 20)})`;
  }

  async generateParallelResumes(
    jobId: string,
    cvFilePath: string,
    job: JobListing,
    options: ParallelResumeOptions = {}
  ): Promise<ParallelResumeResult> {
    console.log('🚀 Parallel Resume Generation');
    console.log('================================\n');

    // Load CV content
    if (!fs.existsSync(cvFilePath)) {
      throw new Error(`CV file not found: ${cvFilePath}`);
    }
    const cvContent = fs.readFileSync(cvFilePath, 'utf-8');
    const cvSummary = cvContent.slice(0, 500);

    // Determine which models to use
    const numModels = options.numModels || this.config.models.length;
    const modelsToUse = this.config.models.slice(0, numModels);

    console.log(`📋 Job: ${job.title} at ${job.company}`);
    console.log(`📊 Models: ${modelsToUse.length} (${modelsToUse.map(m => m.label).join(', ')})\n`);

    // Preview: print pipeline plan and return early without any LLM calls or file I/O
    if (options.preview) {
      const classificationCachePath = path.resolve('logs', jobId, 'classification.json');
      const classifyStep = fs.existsSync(classificationCachePath)
        ? '🔍 Step 1:  Classify (Haiku 4.5) — load from cache'
        : '🔍 Step 1:  Classify (Haiku 4.5) — fresh classification';
      const outputDir = this.getOutputDirectory();
      const date = new Date().toISOString().split('T')[0];
      const folderName = `${jobId}-${job.company.replace(/[^a-z0-9]/gi, '')}-${date}`;

      console.log('📋 Preview Mode — no LLM calls or files will be created');
      console.log('══════════════════════════════════════════════════════');
      console.log(`📄 CV:      ${cvFilePath}`);
      console.log(`📁 Config:  ${path.basename(path.resolve(options.outputDir || 'parallel-config.json'))}`);
      console.log(classifyStep);
      console.log(`📝 Step 2:  Generate with ${modelsToUse.length} model${modelsToUse.length === 1 ? '' : 's'}:`);
      modelsToUse.forEach((m, i) => {
        console.log(`               ${i + 1}. ${m.label.padEnd(22)} (${m.provider})`);
      });
      console.log('🎨 Step 3:  Convert each to PDF via pandoc');
      if (!options.skipCritique) {
        console.log('📊 Step 4:  Critique each resume');
      }
      console.log(`📂 Output:  ${path.join(outputDir, 'Comparisons', folderName)}/`);
      console.log('\nTo execute: npm run dev -- resume ' + jobId + (numModels !== this.config.models.length ? ` -n ${numModels}` : ''));
      return { jobId, company: job.company, role: job.title, timestamp: new Date().toISOString(), comparisonFolder: '', results: [], totalCost: 0, classificationCost: 0, successCount: 0, failureCount: 0 };
    }

    // Step 1: Classification (shared across all models, cached per job)
    console.log('📍 Step 1: Classification (shared)');
    console.log('──────────────────────────────────');
    const classificationCachePath = path.resolve('logs', jobId, 'classification.json');
    let classification: Awaited<ReturnType<ResumeClassifierAgent['classify']>>;
    let classificationCost: number;

    if (fs.existsSync(classificationCachePath)) {
      const cached = JSON.parse(fs.readFileSync(classificationCachePath, 'utf-8'));
      classification = cached;
      classificationCost = 0;
      console.log(`✅ Classification loaded from cache (domain=${classification.domain}, $0.0000)`);
      console.log(`   Domain: ${classification.domain}`);
      console.log(`   Format: ${classification.format}`);
      console.log(`   Roles: ${classification.rolesIncluded}\n`);
    } else {
      const classifierStartTime = Date.now();
      const classifier = new ResumeClassifierAgent(this.classifierApiKey);
      classification = await classifier.classify(job.description, cvSummary);
      const classificationDuration = (Date.now() - classifierStartTime) / 1000;

      // Estimate classifier cost (Haiku 4.5: ~$0.25/$1.25 per MTok, ~500 tokens in/200 out)
      classificationCost = (500 * 0.25 / 1000000) + (200 * 1.25 / 1000000);

      // Persist for future runs
      fs.mkdirSync(path.dirname(classificationCachePath), { recursive: true });
      fs.writeFileSync(classificationCachePath, JSON.stringify(classification, null, 2));

      console.log(`✅ Classification complete (${classificationDuration.toFixed(1)}s)`);
      console.log(`   Domain: ${classification.domain}`);
      console.log(`   Format: ${classification.format}`);
      console.log(`   Roles: ${classification.rolesIncluded}`);
      console.log(`   Cost: ~$${classificationCost.toFixed(4)}\n`);
    }

    // Step 2: Parallel generation with different models
    console.log('📝 Step 2: Parallel Generation');
    console.log('──────────────────────────────────');

    // Estimate total cost and confirm
    const estimatedTotalCost = classificationCost + (modelsToUse.length * 0.10); // rough estimate
    const confirmed = await this.confirmCost(modelsToUse, estimatedTotalCost);
    if (!confirmed) {
      throw new Error('Parallel generation cancelled by user');
    }

    const generatorResults = await this.runParallelGeneration(
      modelsToUse,
      classification,
      job,
      cvContent
    );

    console.log('\n📁 Step 3: PDF Generation & Organization');
    console.log('──────────────────────────────────');

    // Create comparison folder
    const comparisonFolder = this.createComparisonFolder(jobId, job.company);
    console.log(`📂 Comparison folder: ${comparisonFolder}\n`);

    // Generate PDFs for successful results
    const modelResults: ModelResult[] = [];
    let totalGenerationCost = 0;

    for (let i = 0; i < generatorResults.length; i++) {
      const modelConfig = modelsToUse[i];
      const result = generatorResults[i];

      if (result.status === 'fulfilled' && result.value.success && result.value.result) {
        const genResult = result.value.result;
        totalGenerationCost += genResult.cost;

        try {
          // Generate PDF
          const pdfPath = await this.generatePDF(
            genResult.markdownContent,
            job,
            modelConfig.label,
            comparisonFolder
          );

          modelResults.push({
            model: modelConfig.label,
            success: true,
            cost: genResult.cost,
            duration: genResult.duration,
            pdfPath
          });

          console.log(`✅ ${modelConfig.label}: PDF saved`);
        } catch (error) {
          modelResults.push({
            model: modelConfig.label,
            success: false,
            error: error instanceof Error ? error.message : 'PDF generation failed'
          });
          console.log(`❌ ${modelConfig.label}: PDF generation failed`);
        }
      } else {
        const error = result.status === 'rejected'
          ? result.reason
          : result.value.error || 'Unknown error';

        modelResults.push({
          model: modelConfig.label,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
        console.log(`❌ ${modelConfig.label}: ${error}`);
      }
    }

    const totalCost = classificationCost + totalGenerationCost;
    const successCount = modelResults.filter(r => r.success).length;
    const failureCount = modelResults.filter(r => !r.success).length;

    // Generate comparison metadata
    const metadata = this.generateMetadata(
      jobId,
      job,
      modelResults,
      classification,
      totalCost,
      classificationCost
    );

    const metadataPath = path.join(comparisonFolder, 'comparison-metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    this.printResultsTable(modelResults, totalCost, comparisonFolder);

    if (failureCount > 0) {
      console.log(`\n⚠️  ${failureCount} model(s) failed - see metadata for details`);
    }

    return {
      jobId,
      company: job.company,
      role: job.title,
      timestamp: metadata.timestamp,
      comparisonFolder,
      results: modelResults,
      totalCost,
      classificationCost,
      successCount,
      failureCount
    };
  }

  private validateConfig(): void {
    if (!this.config.models || this.config.models.length === 0) {
      throw new Error('No models configured in parallel-config.json');
    }

    if (!this.config.sharedSettings) {
      throw new Error('Missing sharedSettings in parallel-config.json');
    }

    // Validate each model has required fields
    for (const model of this.config.models) {
      if (!model.label || !model.provider || !model.model) {
        throw new Error(`Invalid model configuration: ${JSON.stringify(model)}`);
      }
    }
  }

  private async confirmCost(models: ParallelConfig['models'], estimatedCost: number): Promise<boolean> {
    // Check if auto-confirm is enabled
    if (process.env.LLM_AUTO_CONFIRM === 'true') {
      console.log(`💰 Auto-confirmed: ~$${estimatedCost.toFixed(4)}\n`);
      return true;
    }

    console.log('\n💰 Parallel Resume Generation Cost Estimate');
    console.log('═══════════════════════════════════════════');

    for (const model of models) {
      // Rough estimates based on typical usage
      const estimate = model.provider === 'anthropic'
        ? (model.model.includes('haiku') ? 0.03 : 0.11)
        : 0.08;
      console.log(`   ${model.label}: ~$${estimate.toFixed(4)}`);
    }

    console.log('───────────────────────────────────────────');
    console.log(`   Total estimated: ~$${estimatedCost.toFixed(4)}\n`);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('Proceed? (y/n): ', (answer) => {
        rl.close();
        console.log();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
  }

  private async runParallelGeneration(
    models: ParallelConfig['models'],
    classification: any,
    job: JobListing,
    cvContent: string
  ): Promise<Array<PromiseSettledResult<{ success: boolean; result?: GeneratorResult; error?: string }>>> {
    const { mode, maxRoles } = this.config.sharedSettings;
    const experienceFormat = classification.format as 'standard' | 'split';

    // Create generator instances
    const generators = models.map(modelConfig => {
      const providerConfig: LLMProviderConfig = {
        provider: modelConfig.provider,
        apiKey: modelConfig.provider === 'anthropic'
          ? process.env.ANTHROPIC_API_KEY || ''
          : modelConfig.provider === 'openrouter'
            ? process.env.OPENROUTER_API_KEY || ''
            : process.env.OPENAI_API_KEY || '',
        model: modelConfig.model,
        maxTokens: modelConfig.maxTokens,
        temperature: this.config.sharedSettings.temperature
      };

      return new ResumeGeneratorAgent(providerConfig, mode, experienceFormat, maxRoles);
    });

    // Run all generators in parallel
    const promises = generators.map(async (generator) => {
      try {
        const result = await generator.generate({
          classification,
          job,
          cvContent
        });
        return { success: true, result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    return Promise.allSettled(promises);
  }

  private printResultsTable(modelResults: ModelResult[], totalCost: number, comparisonFolder: string): void {
    const COL_STATUS = 6; // '✅' or '❌' + padding
    const COL_COST   = 9; // '$0.0000'
    const COL_DUR    = 9; // '000.0s'
    const modelWidth = Math.max(
      'Model'.length,
      ...modelResults.map(r => r.model.length)
    );

    const hr = (left: string, mid: string, right: string, fill: string) =>
      left + fill.repeat(modelWidth + 2) + mid + fill.repeat(COL_STATUS + 2) + mid +
      fill.repeat(COL_COST + 2) + mid + fill.repeat(COL_DUR + 2) + right;

    const row = (model: string, status: string, cost: string, dur: string) =>
      `│ ${model.padEnd(modelWidth)} │ ${status.padStart(COL_STATUS)} │ ${cost.padStart(COL_COST)} │ ${dur.padStart(COL_DUR)} │`;

    console.log('\n✅ Parallel Resume Generation Complete');
    console.log(hr('┌', '┬', '┐', '─'));
    console.log(row('Model', 'Status', 'Cost', 'Duration'));
    console.log(hr('├', '┼', '┤', '─'));

    for (const r of modelResults) {
      if (r.success) {
        const cost = `$${(r.cost ?? 0).toFixed(4)}`;
        const dur  = `${(r.duration ?? 0).toFixed(1)}s`;
        console.log(row(r.model, '✅', cost, dur));
      } else {
        console.log(row(r.model, '❌', '—', '—'));
      }
    }

    console.log(hr('├', '┼', '┤', '─'));
    console.log(row('TOTAL', `${modelResults.filter(r => r.success).length}/${modelResults.length}`, `$${totalCost.toFixed(4)}`, ''));
    console.log(hr('└', '┴', '┘', '─'));
    console.log(`📂 ${comparisonFolder}`);
  }

  private static readonly YAML_HEADER = `---
header-includes: |
  \\pagestyle{empty}
---

`;

  private runPandoc(mdPath: string, pdfPath: string): void {
    execSync(`pandoc "${mdPath}" -o "${pdfPath}" -V geometry:margin=0.5in`, { stdio: 'inherit' });
  }

  /** Strip any existing YAML front matter and apply the current header. */
  private normalizeYamlHeader(mdContent: string): string {
    const stripped = mdContent.startsWith('---')
      ? mdContent.replace(/^---[\s\S]*?---\n+/, '')
      : mdContent;
    return ParallelResumeOrchestrator.YAML_HEADER + stripped;
  }

  async regenParallelResumes(jobId: string): Promise<void> {
    const comparisonsDir = path.join(this.getOutputDirectory(), 'Comparisons');

    if (!fs.existsSync(comparisonsDir)) {
      throw new Error(`No Comparisons folder found at ${comparisonsDir}`);
    }

    // Find most recent comparison folder for this jobId
    const match = fs.readdirSync(comparisonsDir)
      .filter(f => f.startsWith(jobId))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(comparisonsDir, f)).mtime }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())[0];

    if (!match) {
      throw new Error(`No comparison folder found for job ${jobId}. Run without --regen first.`);
    }

    const folder = path.join(comparisonsDir, match.name);
    const mdFiles = fs.readdirSync(folder).filter(f => f.endsWith('.md'));

    if (mdFiles.length === 0) {
      throw new Error(`No .md source files in ${folder}. Run without --regen first to generate content.`);
    }

    console.log(`🔄 Regen: rebuilding ${mdFiles.length} PDF${mdFiles.length === 1 ? '' : 's'} from markdown\n`);

    const modelResults: ModelResult[] = [];

    for (const mdFile of mdFiles) {
      const mdPath = path.join(folder, mdFile);
      const pdfPath = mdPath.replace(/\.md$/, '.pdf');
      const labelMatch = mdFile.match(/^\[([^\]]+)\]/);
      const label = labelMatch ? labelMatch[1] : mdFile.replace(/\.md$/, '');

      // Refresh YAML header in case the file was written by an older code version
      const raw = fs.readFileSync(mdPath, 'utf-8');
      fs.writeFileSync(mdPath, this.normalizeYamlHeader(raw));

      const start = Date.now();
      try {
        this.runPandoc(mdPath, pdfPath);
        modelResults.push({ model: label, success: true, cost: 0, duration: (Date.now() - start) / 1000 });
        console.log(`✅ ${label}: PDF rebuilt`);
      } catch (error) {
        modelResults.push({ model: label, success: false, error: error instanceof Error ? error.message : 'pandoc failed' });
        console.log(`❌ ${label}: pandoc failed`);
      }
    }

    this.printResultsTable(modelResults, 0, folder);

    if (process.platform === 'darwin') {
      execSync(`open "${folder}"`);
    }
  }

  private createComparisonFolder(jobId: string, company: string): string {
    // Get output directory
    const baseDir = this.getOutputDirectory();

    // Create Comparisons subdirectory
    const comparisonsDir = path.join(baseDir, 'Comparisons');
    if (!fs.existsSync(comparisonsDir)) {
      fs.mkdirSync(comparisonsDir, { recursive: true });
    }

    // Create timestamped folder for this comparison
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const folderName = `${jobId}-${company.replace(/[^a-z0-9]/gi, '')}-${timestamp}`;
    const comparisonFolder = path.join(comparisonsDir, folderName);

    if (!fs.existsSync(comparisonFolder)) {
      fs.mkdirSync(comparisonFolder, { recursive: true });
    }

    return comparisonFolder;
  }

  private getOutputDirectory(): string {
    const envDir = process.env.RESUME_OUTPUT_DIR;
    if (envDir) {
      // Handle tilde expansion
      if (envDir.startsWith('~/')) {
        const homeDir = os.homedir();
        return path.join(homeDir, envDir.slice(2));
      }
      return envDir;
    }

    // Default to Google Drive location
    const homeDir = os.homedir();
    return path.join(homeDir, 'Google Drive', 'My Drive', 'Professional', 'Job Search', 'Applications', 'Resumes');
  }

  private async generatePDF(
    markdownContent: string,
    job: JobListing,
    modelLabel: string,
    outputDir: string
  ): Promise<string> {
    const fullMarkdown = ParallelResumeOrchestrator.YAML_HEADER + markdownContent;

    // Generate filename base (shared between .md source and .pdf output)
    const candidateName = this.extractCandidateName(markdownContent);
    const sanitize = (s: string) => s.replace(/[|<>:"/\\?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim();
    const baseName = `[${sanitize(modelLabel)}] ${sanitize(candidateName)} for ${sanitize(job.title)} at ${sanitize(job.company)}`;

    // Persist markdown source before pandoc — survives PDF generation failures
    const mdPath = path.join(outputDir, `${baseName}.md`);
    fs.writeFileSync(mdPath, fullMarkdown);

    const pdfPath = path.join(outputDir, `${baseName}.pdf`);

    try {
      this.runPandoc(mdPath, pdfPath);
      return pdfPath;
    } catch (error) {
      // Leave mdPath in place — caller can retry pandoc manually
      throw error;
    }
  }

  private extractCandidateName(markdownContent: string): string {
    // Extract name from the first # heading
    for (const line of markdownContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('# ')) {
        return trimmed.replace(/^#+\s*/, '').trim();
      }
    }
    return 'Resume';
  }

  private generateMetadata(
    jobId: string,
    job: JobListing,
    results: ModelResult[],
    classification: any,
    totalCost: number,
    classificationCost: number
  ): any {
    return {
      jobId,
      company: job.company,
      role: job.title,
      timestamp: new Date().toISOString(),
      classification: {
        domain: classification.domain,
        format: classification.format,
        rolesIncluded: classification.rolesIncluded,
        reasoning: classification.reasoning,
        domainSignals: classification.domainSignals
      },
      results: results.map(r => ({
        model: r.model,
        success: r.success,
        cost: r.cost,
        duration: r.duration,
        pdfFilename: r.pdfPath ? path.basename(r.pdfPath) : undefined,
        error: r.error
      })),
      costs: {
        classification: classificationCost,
        generation: totalCost - classificationCost,
        total: totalCost
      },
      successCount: results.filter(r => r.success).length,
      failureCount: results.filter(r => !r.success).length
    };
  }
}

import { ClaudeBaseAgent } from './claude-base-agent';
import { JobListing, AgentConfig, StatementType, StatementOptions, StatementResult, InterviewPrepResult, JobTheme, ThemeExtractionResult, ThemeExample, ProfileConfig, ProfileResult, ProjectInfo, ProjectExtractionResult, AboutMeSection, AboutMeSectionData, SectionGenerationResult, SectionCritiqueResult } from '../types';
import { WebScraper } from '../utils/web-scraper';
import { resolveFromProjectRoot } from '../utils/project-root';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

export class InterviewPrepAgent extends ClaudeBaseAgent {
  private currentJobId: string = '';
  private cachedFocalTheme: string | null = null; // Cache auto-determined focal theme to avoid redundant LLM calls
  private cachedCompanyUrl: string | null = null; // Cache company URL to avoid asking twice
  private profileConfig: ProfileConfig = {
    location: "hybrid in/near SF",
    role: "I'm a hands-on leader who still builds",
    preferredStack: ["React", "Python", "TypeScript", "GCP"],
    teamSize: "3-5 Sr. EM/Staff-level full-stack direct reports",
    domains: ["MarTech", "FinTech", "ClimateTech"],
    domainOfExcellence: "SaaS and data-driven products"
  };

  constructor(claudeApiKey: string, model?: string, maxTokens?: number) {
    super(claudeApiKey, model, maxTokens);
  }

  private getJobPrepDir(jobId: string): string {
    const dir = resolveFromProjectRoot('logs', jobId, 'prep');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private getMinSalary(): number {
    const envSalary = process.env.MIN_SALARY;
    if (envSalary) {
      const parsedSalary = parseInt(envSalary, 10);
      if (!isNaN(parsedSalary)) {
        return parsedSalary;
      }
    }
    // Fallback to a default if not set in environment
    return 225000;
  }

  async extract(): Promise<never> {
    throw new Error('InterviewPrepAgent does not implement extract method. Use generateMaterial instead.');
  }

  async createResume(): Promise<never> {
    throw new Error('InterviewPrepAgent does not implement createResume method. Use generateMaterial instead.');
  }

  async generateMaterial(
    type: StatementType,
    jobId: string,
    cvFilePath: string,
    options: StatementOptions = {},
    regenerate: boolean = false,
    contentOnly: boolean = false
  ): Promise<StatementResult> {
    // Focus functionality has been merged into 'about-me' - no separate focus type needed
    try {
      // Clear cached prompts for new generation
      this.cachedFocalTheme = null;
      this.cachedCompanyUrl = null;

      // Store jobId for use in sub-methods
      this.currentJobId = jobId;
      let content: string;
      
      // If content-only mode and not regenerating, just find the most recent statement file
      if (contentOnly && !regenerate) {
        const mostRecentContent = this.loadMostRecentMaterial(jobId, type, options);
        if (mostRecentContent) {
          return {
            success: true,
            content: mostRecentContent,
            type,
            characterCount: mostRecentContent.length
          };
        } else {
          // No existing statement found, fall through to generate new one
          console.log(`📋 No existing ${type.replace('-', ' ')} material found for job ${jobId}, generating...`);
        }
      }
      
      // Load job data and CV content
      const jobData = this.loadJobData(jobId);
      const cvContent = fs.readFileSync(cvFilePath, 'utf-8');
      
      // Check if we should use cached content or regenerate
      if (!regenerate && !contentOnly) {
        const cachedContent = this.loadCachedMaterial(jobId, type, cvFilePath, options);
        if (cachedContent) {
          console.log(`📋 Using cached ${type.replace('-', ' ')} material for job ${jobId}`);
          content = cachedContent;
        } else {
          console.log(`📋 No cached ${type.replace('-', ' ')} material found for job ${jobId}, generating...`);
          content = await this.createMaterial(type, jobData, cvContent, options);
          // Cache the newly generated content
          this.cacheMaterial(jobId, type, content, cvFilePath, options);
        }
      } else {
        // Regenerate content or content-only mode with no existing file
        if (regenerate) {
          console.log(`🔄 Regenerating ${type.replace('-', ' ')} material for job ${jobId}`);
        }
        content = await this.createMaterial(type, jobData, cvContent, options);
        // Cache the regenerated content
        this.cacheMaterial(jobId, type, content, cvFilePath, options);
      }
      
      return {
        success: true,
        content,
        type,
        characterCount: content.length
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        type
      };
    }
  }

  async generateInterviewPrep(
    jobId: string,
    cvFilePath: string,
    options: StatementOptions = {},
    regenerate: boolean = false,
    contentOnly: boolean = false
  ): Promise<InterviewPrepResult> {
    try {
      // Store jobId for use in sub-methods
      this.currentJobId = jobId;

      // Generate comprehensive interview content (now includes focus story within about-me structure)
      const interviewResult = await this.generateMaterial(
        'about-me' as StatementType,
        jobId,
        cvFilePath,
        options,
        regenerate,
        contentOnly
      );

      // Generate company rubric
      const companyRubricGenerated = await this.generateCompanyRubric(jobId);

      // Note: Content copying to clipboard will be handled by the CLI layer

      return {
        success: interviewResult.success,
        aboutMeContent: interviewResult.success ? interviewResult.content : undefined,
        focusStoryContent: undefined, // Now integrated into aboutMeContent
        companyRubricGenerated,
        error: interviewResult.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  private async generateCompanyRubric(jobId: string): Promise<boolean> {
    try {
      const jobData = this.loadJobData(jobId);
      const prepDir = this.getJobPrepDir(jobId);

      // Check if company-rubric.txt already exists (unless regenerating)
      const rubricPath = path.join(prepDir, 'company-rubric.txt');
      if (fs.existsSync(rubricPath)) {
        console.log('📊 Company rubric already exists, skipping generation');
        return true;
      }

      // Load or extract themes
      const themes = await this.getOrExtractThemes(jobData);

      // Load company values if they exist
      const companyValuesPath = path.join(prepDir, 'company-values.txt');
      let companyValues = '';
      if (fs.existsSync(companyValuesPath)) {
        companyValues = fs.readFileSync(companyValuesPath, 'utf-8');
      }

      const prompt = `You are an expert in talent evaluation and recruitment. Based on the following job information, create a company evaluation rubric that identifies 5-7 key elements this company likely uses to evaluate candidates for this position.

## Job Information:
**Company:** ${jobData.company}
**Title:** ${jobData.title}
**Description:** ${jobData.description}

## Priority Themes Identified:
${themes.map(theme => `• **${theme.name}**: ${theme.definition} (Priority: ${theme.importance})`).join('\n')}

${companyValues ? `## Company Values:
${companyValues}` : ''}

## Instructions:
Create a practical evaluation rubric with 5-7 key elements that represent what this company is likely looking for in candidates. Each element should:

1. Be specific to this role and company context
2. Include both technical and soft skills/attributes
3. Be measurable or observable in interviews
4. Align with the job themes and company values
5. Progress from foundational to differentiating criteria

Format as:
# Company Evaluation Rubric: ${jobData.company} - ${jobData.title}

## Evaluation Criteria:

### 1. [Criterion Name]
**What they're looking for:** [Specific description]
**Why it matters:** [Context from job/company]
**Interview signals:** [How this would be evaluated]

[Continue for each criterion...]

## Overall Assessment Framework:
[Brief summary of how these criteria work together]`;

      const response = await this.makeClaudeRequest(prompt);

      // Save the rubric to file
      fs.writeFileSync(rubricPath, response.trim(), 'utf-8');

      return true;
    } catch (error) {
      console.warn(`⚠️  Failed to generate company rubric: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  private loadJobData(jobId: string): JobListing {
    const jobDir = resolveFromProjectRoot('logs', jobId);

    if (!fs.existsSync(jobDir)) {
      throw new Error(`Job directory not found for ID: ${jobId}`);
    }

    const files = fs.readdirSync(jobDir);
    const jobFile = files.find(file => file.startsWith('job-') && file.endsWith('.json'));
    if (!jobFile) {
      throw new Error(`Job file not found for ID: ${jobId}`);
    }

    const jobPath = path.join(jobDir, jobFile);
    const jobData = fs.readFileSync(jobPath, 'utf-8');
    return JSON.parse(jobData);
  }

  private loadPromptTemplate(type: StatementType, person?: 'first' | 'third'): string {
    try {
      const promptPath = path.resolve('prompts', `statement-${type}.md`);
      return fs.readFileSync(promptPath, 'utf-8');
    } catch (error) {
      console.warn(`⚠️  Failed to load prompt template for ${type}, using fallback`);
      return this.getFallbackPrompt(type, person);
    }
  }

  private getFallbackPrompt(type: StatementType, person?: 'first' | 'third'): string {
    const basePrompt = `You are a professional writer helping create a ${type.replace('-', ' ')} based on a job posting and work history. Be sure to use concise, inspiring, founder-caliber high-impact framing; lead with the 'so what' early.`;
    const perspective = person || 'first';
    const personInstruction = perspective === 'third'
      ? 'Write in third person using "Anthony", "he", "his", "him".'
      : 'Write in first person using "I", "my", "me".';

    switch (type) {
      case 'cover-letter':
        const letterLength = perspective === 'third'
          ? 'between 400-500 characters in a SINGLE concise paragraph'
          : 'between 600-850 characters in up to two brief paragraphs';
        return `${basePrompt}\n\nCreate a cover letter ${letterLength}. Use informal tone. ${personInstruction} Do NOT include any greeting (like "Greetings:", "Dear...") or closing (like "Regards", "Sincerely"). Begin and end directly with substantive content.`;
      case 'endorsement':
        return `${basePrompt}\n\nCreate an endorsement between 375-500 characters in third person. Use first name only when referencing the candidate.`;
      case 'about-me':
        return `${basePrompt}\n\nCreate talking points as a two-level nested bullet list for "Tell me about yourself" response. Maximum 900 characters. ${personInstruction}`;
      case 'general':
        return `${basePrompt}\n\nCreate a general statement between 250-425 characters in third person. Reference examples from entire work history.`;
      default:
        return basePrompt;
    }
  }

  private async createMaterial(
    type: StatementType,
    job: JobListing,
    cvContent: string,
    options: StatementOptions
  ): Promise<string> {
    // For about-me type, use section-based generation if available
    if (type === 'about-me') {
      return await this.createAboutMeMaterial(job, cvContent, options);
    }
    
    // For other types, use the original monolithic approach
    let promptTemplate = this.loadPromptTemplate(type, options.person);

    // Load company values if available
    const companyValues = await this.loadCompanyValues(this.currentJobId, options.companyUrl);

    // Build the complete prompt
    const prompt = this.buildPrompt(promptTemplate, type, job, cvContent, options, companyValues);
    
    // Log the prompt to file
    this.logPromptToFile(prompt, type);
    
    // Log status message
    console.log(`📝 Generating ${type.replace('-', ' ')} material...`);
    
    const response = await this.makeClaudeRequest(prompt);
    
    // Clean up the response
    return this.cleanResponse(response, type);
  }

  private async createAboutMeMaterial(
    job: JobListing,
    cvContent: string,
    options: StatementOptions
  ): Promise<string> {
    // Check if all sections already exist
    const existingSections = this.listSections(this.currentJobId);
    const allSections: AboutMeSection[] = ['hook', 'career-snapshot', 'themes', 'why', 'focus-story', 'close'];
    const missingSections = allSections.filter(s => !existingSections.includes(s));

    // If all sections exist, combine them
    if (missingSections.length === 0) {
      console.log('📋 All sections exist, combining...');
      return await this.combineSections(this.currentJobId);
    }

    // Generate missing sections
    console.log(`📝 Generating missing sections: ${missingSections.join(', ')}`);
    const companyValues = await this.loadCompanyValues(this.currentJobId, options.companyUrl);

    for (const section of missingSections) {
      console.log(`📝 Generating ${section} section...`);
      
      switch (section) {
        case 'hook':
          const hookContent = await this.generateHook(job, cvContent, options);
          this.saveSection(this.currentJobId, 'hook', hookContent);
          break;
        case 'career-snapshot':
          const snapshotContent = await this.generateCareerSnapshot(job, cvContent, options);
          this.saveSection(this.currentJobId, 'career-snapshot', snapshotContent);
          break;
        case 'focus-story':
          const userTheme = await this.determineFocalThemeFromJob(job);
          const focusContent = await this.generateFocusStory(job, cvContent, userTheme, options);
          this.saveSection(this.currentJobId, 'focus-story', focusContent, { userTheme });
          break;
        case 'themes':
          const themesContent = await this.generateThemes(job, cvContent, options);
          this.saveSection(this.currentJobId, 'themes', themesContent);
          break;
        case 'why':
          const whyContent = await this.generateWhyCompany(job, cvContent, companyValues, options);
          this.saveSection(this.currentJobId, 'why', whyContent);
          break;
        case 'close':
          const closeContent = await this.generateClose(job, cvContent, options);
          this.saveSection(this.currentJobId, 'close', closeContent);
          break;
      }
    }

    // Combine all sections
    return await this.combineSections(this.currentJobId);
  }

  // Section-specific generation methods
  private loadSectionPrompt(section: AboutMeSection): string {
    try {
      const promptPath = path.resolve('prompts', `statement-about-me-${section}.md`);
      return fs.readFileSync(promptPath, 'utf-8');
    } catch (error) {
      console.warn(`⚠️  Failed to load prompt template for ${section}, using fallback`);
      return this.getFallbackSectionPrompt(section);
    }
  }

  private getFallbackSectionPrompt(section: AboutMeSection): string {
    const basePrompt = `You are a professional interview coach creating ${section} section for a "Tell me about yourself" response.`;

    switch (section) {
      case 'hook':
        return `${basePrompt}\n\nCreate 3 RTF bullets: professional identity, power statement, and unique differentiator. Dynamic and role-specific — do not use a hardcoded opener.`;
      case 'career-snapshot':
        return `${basePrompt}\n\nCreate 3 RTF bullets covering career arc, key skills, and standout achievement.`;
      case 'focus-story':
        return `${basePrompt}\n\nCreate a detailed STAR method focus story in RTF format.`;
      case 'themes':
        return `${basePrompt}\n\nCreate key themes with examples in RTF format.`;
      case 'why':
        return `${basePrompt}\n\nCreate 4 RTF bullets: why this company/role, why now & why you, transition framing (confident/positive), gap addressing or confidence close.`;
      case 'close':
        return `${basePrompt}\n\nCreate 2 RTF bullets: what you bring + unique positioning, and your energy/mindset stepping into the role.`;
      case 'personal-touch':
        return `${basePrompt}\n\nCreate 1 RTF bullet with a personal passion or hobby that connects authentically to professional life.`;
      default:
        return basePrompt;
    }
  }

  async generateSection(
    section: AboutMeSection,
    jobId: string,
    cvFilePath: string,
    options: StatementOptions = {},
    regenerate: boolean = false
  ): Promise<SectionGenerationResult> {
    try {
      this.currentJobId = jobId;
      
      // Check if section exists and we're not regenerating
      if (!regenerate) {
        const existing = this.loadSection(jobId, section);
        if (existing) {
          console.log(`📋 Using existing ${section} section for job ${jobId}`);
          return {
            success: true,
            content: existing.content,
            section
          };
        }
      }

      const jobData = this.loadJobData(jobId);
      const cvContent = fs.readFileSync(cvFilePath, 'utf-8');
      const companyValues = await this.loadCompanyValues(jobId, options.companyUrl);

      let content: string;
      switch (section) {
        case 'hook':
          content = await this.generateHook(jobData, cvContent, options);
          break;
        case 'career-snapshot':
          content = await this.generateCareerSnapshot(jobData, cvContent, options);
          break;
        case 'focus-story':
          const userTheme = await this.determineFocalThemeFromJob(jobData);
          content = await this.generateFocusStory(jobData, cvContent, userTheme, options);
          this.saveSection(jobId, section, content, { userTheme });
          return { success: true, content, section };
        case 'themes':
          content = await this.generateThemes(jobData, cvContent, options);
          break;
        case 'why':
          content = await this.generateWhyCompany(jobData, cvContent, companyValues, options);
          break;
        case 'close':
          content = await this.generateClose(jobData, cvContent, options);
          break;
        case 'personal-touch':
          content = await this.generatePersonalTouch(jobData, cvContent, options);
          break;
        default:
          return { success: false, section, error: `Unknown section: ${section}` };
      }

      this.saveSection(jobId, section, content);
      return { success: true, content, section };
    } catch (error) {
      return {
        success: false,
        section,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  private async generateHook(
    job: JobListing,
    cvContent: string,
    options: StatementOptions
  ): Promise<string> {
    const promptTemplate = this.loadSectionPrompt('hook');
    const prompt = this.buildSectionPrompt(promptTemplate, 'hook', job, cvContent, options);

    this.logPromptToFile(prompt, 'about-me-hook');
    console.log('📝 Generating hook section...');

    const response = await this.makeClaudeRequest(prompt);
    return this.cleanResponse(response, 'about-me');
  }

  private async generateCareerSnapshot(
    job: JobListing,
    cvContent: string,
    options: StatementOptions
  ): Promise<string> {
    const promptTemplate = this.loadSectionPrompt('career-snapshot');
    const prompt = this.buildSectionPrompt(promptTemplate, 'career-snapshot', job, cvContent, options);

    this.logPromptToFile(prompt, 'about-me-career-snapshot');
    console.log('📝 Generating career snapshot section...');

    const response = await this.makeClaudeRequest(prompt);
    return this.cleanResponse(response, 'about-me');
  }

  private async generateClose(
    job: JobListing,
    cvContent: string,
    options: StatementOptions
  ): Promise<string> {
    const promptTemplate = this.loadSectionPrompt('close');
    const prompt = this.buildSectionPrompt(promptTemplate, 'close', job, cvContent, options);

    this.logPromptToFile(prompt, 'about-me-close');
    console.log('📝 Generating close section...');

    const response = await this.makeClaudeRequest(prompt);
    return this.cleanResponse(response, 'about-me');
  }

  private async generatePersonalTouch(
    job: JobListing,
    cvContent: string,
    options: StatementOptions
  ): Promise<string> {
    const promptTemplate = this.loadSectionPrompt('personal-touch');
    const prompt = this.buildSectionPrompt(promptTemplate, 'personal-touch', job, cvContent, options);

    this.logPromptToFile(prompt, 'about-me-personal-touch');
    console.log('📝 Generating personal touch section...');

    const response = await this.makeClaudeRequest(prompt);
    return this.cleanResponse(response, 'about-me');
  }

  private async generateFocusStory(
    job: JobListing,
    cvContent: string,
    userTheme: string | null,
    options: StatementOptions
  ): Promise<string> {
    let promptTemplate = this.loadSectionPrompt('focus-story');
    
    // Inject user theme
    if (userTheme) {
      promptTemplate = promptTemplate.replace('{{userTheme}}', userTheme);
    } else {
      promptTemplate = promptTemplate.replace('{{userTheme}}', 'high-impact achievements that best demonstrate your capabilities');
    }
    
    const prompt = this.buildSectionPrompt(promptTemplate, 'focus-story', job, cvContent, options);
    
    this.logPromptToFile(prompt, 'about-me-focus-story');
    console.log('📝 Generating focus story section...');
    
    const response = await this.makeClaudeRequest(prompt);
    return this.cleanResponse(response, 'about-me');
  }

  private async generateThemes(
    job: JobListing,
    cvContent: string,
    options: StatementOptions
  ): Promise<string> {
    const promptTemplate = this.loadSectionPrompt('themes');
    
    // Get or extract themes
    const userTheme = await this.determineFocalThemeFromJob(job);
    const themes = await this.getOrExtractThemes(job);
    const themesWithExamples = await this.enrichThemesWithExamples(themes, cvContent, job, userTheme);
    await this.updateThemesWithExamples(job, themesWithExamples, this.currentJobId);
    
    // Inject themes into prompt
    const themesList = themesWithExamples
      .map((theme, index) => {
        let themeText = `${index + 1}. **${theme.name}**: ${theme.definition}`;
        if (theme.examples && theme.examples.length > 0) {
          themeText += '\n   Examples from CV:';
          theme.examples.forEach((example) => {
            themeText += `\n   - ${example.text} (${example.impact})`;
          });
        }
        return themeText;
      })
      .join('\n\n');
    
    let prompt = promptTemplate.replace('{{themesWithExamples}}', themesList);
    prompt = this.buildSectionPrompt(prompt, 'themes', job, cvContent, options);
    
    this.logPromptToFile(prompt, 'about-me-themes');
    console.log('📝 Generating themes section...');
    
    const response = await this.makeClaudeRequest(prompt);
    return this.cleanResponse(response, 'about-me');
  }

  private async generateWhyCompany(
    job: JobListing,
    cvContent: string,
    companyValues: string | null,
    options: StatementOptions
  ): Promise<string> {
    const promptTemplate = this.loadSectionPrompt('why');
    const prompt = this.buildSectionPrompt(promptTemplate, 'why', job, cvContent, options, companyValues);
    
    this.logPromptToFile(prompt, 'about-me-why');
    console.log('📝 Generating why company section...');
    
    const response = await this.makeClaudeRequest(prompt);
    return this.cleanResponse(response, 'about-me');
  }

  private buildSectionPrompt(
    template: string,
    section: AboutMeSection,
    job: JobListing,
    cvContent: string,
    options: StatementOptions,
    companyValues?: string | null
  ): string {
    // Build company values section if available
    let companyValuesSection = '';
    if (companyValues) {
      companyValuesSection = `\n\nCompany Values:\n${companyValues}\n\nEnsure your response aligns with and demonstrates these company values through specific examples and language choices.`;
    }

    // Replace template variables
    let prompt = template
      .replace(/{{job\.title}}/g, job.title)
      .replace(/{{job\.company}}/g, job.company)
      .replace(/{{job\.description}}/g, job.description)
      .replace(/{{cvContent}}/g, cvContent)
      .replace(/{{emphasis}}/g, options.emphasis || '')
      .replace(/{{companyInfo}}/g, options.companyInfo || '')
      .replace(/{{customInstructions}}/g, options.customInstructions || '')
      .replace(/{{companyValues}}/g, companyValuesSection || '')
      .replace(/{{person}}/g, options.person || 'first');

    // Remove the section for the opposite person perspective to avoid confusion
    const person = options.person || 'first';
    if (person === 'third') {
      // Remove FIRST PERSON section when using third person
      prompt = prompt.replace(/\*\*FIRST PERSON\*\*[^]*?(?=\*\*THIRD PERSON\*\*)/s, '');
    } else {
      // Remove THIRD PERSON section when using first person
      prompt = prompt.replace(/\*\*THIRD PERSON\*\*[^]*?(?=##|$)/s, '');
    }

    prompt += `\n\nJob Posting:\nTitle: ${job.title}\nCompany: ${job.company}\nDescription: ${job.description}\n\nWork History:\n${cvContent}`;

    return prompt;
  }

  async combineSections(jobId: string): Promise<string> {
    try {
      const jobData = this.loadJobData(jobId);
      const requiredSections: AboutMeSection[] = ['hook', 'career-snapshot', 'themes', 'why', 'focus-story', 'close'];
      const sectionContents: Partial<Record<AboutMeSection, string>> = {};

      // Load required sections
      for (const section of requiredSections) {
        const sectionData = this.loadSection(jobId, section);
        if (sectionData) {
          sectionContents[section] = sectionData.content;
        } else {
          throw new Error(`Missing section: ${section}. Please generate all sections first.`);
        }
      }

      // Load optional personal-touch section if it exists
      const personalTouchData = this.loadSection(jobId, 'personal-touch');
      if (personalTouchData) {
        sectionContents['personal-touch'] = personalTouchData.content;
      }

      // Extract RTF content from each section (remove RTF header/footer if present)
      const extractRTFBody = (rtfContent: string): string => {
        // Look for the specific font table pattern we use
        const fontTableEnd = rtfContent.indexOf('Times New Roman;}}');
        if (fontTableEnd !== -1) {
          // Extract everything after the font table definition
          let body = rtfContent.substring(fontTableEnd + 'Times New Roman;}}'.length);
          // Remove the final closing brace
          body = body.replace(/\}$/s, '');
          return body.trim();
        }
        // If no RTF wrapper found, return as-is
        return rtfContent.trim();
      };

      // Combine sections in order: hook, career-snapshot, themes, why, focus-story, close, [personal-touch]
      const bodies = requiredSections.map(s => extractRTFBody(sectionContents[s]!));
      if (sectionContents['personal-touch']) {
        bodies.push(extractRTFBody(sectionContents['personal-touch']));
      }

      // Combine into final RTF document with proper font selection and formatting
      const combinedRTF = `{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;}}
\\f0\\fs24
${bodies.join('\n')}
}`;

      // Save combined output as RTF
      const rtfPath = path.join(this.getJobPrepDir(jobId), 'about-me-combined.rtf');

      fs.writeFileSync(rtfPath, combinedRTF, 'utf-8');
      console.log(`📝 Combined sections saved to: ${rtfPath}`);

      return combinedRTF;
    } catch (error) {
      throw new Error(`Failed to combine sections: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async critiqueSection(
    jobId: string,
    section: AboutMeSection,
    cvFilePath: string
  ): Promise<SectionCritiqueResult> {
    try {
      const sectionData = this.loadSection(jobId, section);
      if (!sectionData) {
        return {
          success: false,
          section,
          error: `Section ${section} not found. Please generate it first.`
        };
      }

      const jobData = this.loadJobData(jobId);
      const cvContent = fs.readFileSync(cvFilePath, 'utf-8');

      const sectionNames: Record<AboutMeSection, string> = {
        'hook': 'Hook (identity, power statement, differentiator)',
        'career-snapshot': 'Career Snapshot (arc, skills, standout achievement)',
        'focus-story': 'Focus Story (STAR method)',
        'themes': 'Key Themes with Examples',
        'why': 'Why This Role & Company',
        'close': 'Close with Confidence',
        'personal-touch': 'Personal Touch'
      };

      const prompt = `You are an expert interview coach critiquing the ${sectionNames[section]} section of a "Tell me about yourself" interview response.

## Section Content:
${sectionData.content}

## Job Context:
**Title:** ${jobData.title}
**Company:** ${jobData.company}
**Description:** ${jobData.description.substring(0, 500)}...

## Work History:
${cvContent.substring(0, 1000)}...

## Instructions:
Provide a comprehensive critique of this section. Evaluate:
1. **Clarity and Impact**: Is the message clear and compelling?
2. **Relevance**: Does it align with the job requirements?
3. **Specificity**: Are examples concrete and quantifiable?
4. **Structure**: Is the format appropriate for an interview response?
5. **Tone**: Is the tone appropriate (informal but professional)?

Rate the section on a scale of 1-10 and provide:
- **Strengths**: What works well
- **Weaknesses**: What needs improvement
- **Recommendations**: Specific, actionable suggestions for improvement
- **Detailed Analysis**: A paragraph explaining your overall assessment

Respond in JSON format:
{
  "rating": 8,
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "recommendations": ["recommendation 1", "recommendation 2"],
  "detailedAnalysis": "Overall assessment paragraph..."
}`;

      const response = await this.makeClaudeRequest(prompt);
      
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in response');
        }

        const critique = JSON.parse(jsonMatch[0]);
        
        return {
          success: true,
          section,
          rating: critique.rating,
          strengths: critique.strengths || [],
          weaknesses: critique.weaknesses || [],
          recommendations: critique.recommendations || [],
          detailedAnalysis: critique.detailedAnalysis || ''
        };
      } catch (parseError) {
        // If JSON parsing fails, return a basic critique
        return {
          success: true,
          section,
          detailedAnalysis: response
        };
      }
    } catch (error) {
      return {
        success: false,
        section,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async refineSection(
    jobId: string,
    section: AboutMeSection,
    editedContent: string,
    cvFilePath: string
  ): Promise<SectionGenerationResult> {
    try {
      const jobData = this.loadJobData(jobId);
      const cvContent = fs.readFileSync(cvFilePath, 'utf-8');
      const companyValues = await this.loadCompanyValues(jobId);

      const sectionNames: Record<AboutMeSection, string> = {
        'hook': 'Hook (identity, power statement, differentiator)',
        'career-snapshot': 'Career Snapshot (arc, skills, standout achievement)',
        'focus-story': 'Focus Story (STAR method)',
        'themes': 'Key Themes with Examples',
        'why': 'Why This Role & Company',
        'close': 'Close with Confidence',
        'personal-touch': 'Personal Touch'
      };

      const prompt = `You are an expert interview coach refining the ${sectionNames[section]} section of a "Tell me about yourself" interview response.

## User's Edited Content:
${editedContent}

## Job Context:
**Title:** ${jobData.title}
**Company:** ${jobData.company}
**Description:** ${jobData.description.substring(0, 500)}...

## Work History:
${cvContent.substring(0, 1000)}...

${companyValues ? `## Company Values:\n${companyValues}\n` : ''}

## Instructions:
The user has manually edited this section. Your task is to refine it while:
1. **Preserving user intent**: Keep the user's key messages, examples, and personal touches
2. **Improving clarity**: Make the language clearer and more impactful
3. **Enhancing alignment**: Better align with the job requirements and company values
4. **Maintaining format**: Keep the RTF format and structure appropriate for this section
5. **Preserving tone**: Maintain the informal but professional tone

Do NOT rewrite from scratch - refine what the user provided. Make targeted improvements while keeping their voice and intent.

Return ONLY the refined RTF content, no explanations or commentary.`;

      const response = await this.makeClaudeRequest(prompt);
      const refinedContent = this.cleanResponse(response, 'about-me');

      // Save the refined section
      this.saveSection(jobId, section, refinedContent, { refined: true });

      return {
        success: true,
        content: refinedContent,
        section
      };
    } catch (error) {
      return {
        success: false,
        section,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  private buildPrompt(
    template: string,
    type: StatementType,
    job: JobListing,
    cvContent: string,
    options: StatementOptions,
    companyValues?: string | null
  ): string {
    // Build company values section if available
    let companyValuesSection = '';
    if (companyValues) {
      companyValuesSection = `\n\nCompany Values:\n${companyValues}\n\nEnsure your response aligns with and demonstrates these company values through specific examples and language choices.`;
    }

    // Replace template variables
    let prompt = template
      .replace(/{{job\.title}}/g, job.title)
      .replace(/{{job\.company}}/g, job.company)
      .replace(/{{job\.description}}/g, job.description)
      .replace(/{{cvContent}}/g, cvContent)
      .replace(/{{emphasis}}/g, options.emphasis || '')
      .replace(/{{companyInfo}}/g, options.companyInfo || '')
      .replace(/{{customInstructions}}/g, options.customInstructions || '')
      .replace(/{{companyValues}}/g, companyValuesSection)
      .replace(/{{person}}/g, options.person || 'first');

    // Add specific instructions based on type
    const typeInstructions = this.getTypeSpecificInstructions(type, options);
    if (typeInstructions) {
      prompt += `\n\nAdditional Instructions:\n${typeInstructions}`;
    }

    prompt += `\n\nJob Posting:\nTitle: ${job.title}\nCompany: ${job.company}\nDescription: ${job.description}\n\nWork History:\n${cvContent}`;

    return prompt;
  }

  private getTypeSpecificInstructions(type: StatementType, options: StatementOptions): string {
    const person = options.person || 'first';

    switch (type) {
      case 'cover-letter':
        const letterSpec = person === 'third'
          ? 'Length: 400-500 characters. SINGLE concise paragraph only.'
          : 'Length: 600-850 characters. Up to two brief paragraphs.';
        let instructions = `${letterSpec} Informal tone. Do NOT include any greeting (like "Greetings:", "Dear...") or closing (like "Regards", "Sincerely", signature). Begin and end directly with substantive content.`;
        if (options.emphasis) {
          instructions += `\n\nEMPHASIS: ${options.emphasis}`;
        }
        return instructions;

      case 'endorsement':
        return 'Length: 375-500 characters. Third person. Use first name only. Tell stories about strengths and value.';

      case 'about-me':
        let aboutInstructions = 'Rich Text Format (RTF) with two-level nested bullet list. Informal tone. Max 900 characters. Include desire for small team (5-7 people) and ability to have impact.';
        if (options.companyInfo) {
          aboutInstructions += `\n\nInclude: "I'm excited about ${options.companyInfo} because..."`;
        }
        return aboutInstructions;

      case 'general':
        return 'Length: 250-425 characters. Third person. Use first name only. Reference examples from entire work history, including end user work and data center/on-premise deployment experience.';

      default:
        return '';
    }
  }

  private generateCacheKey(type: StatementType, cvFilePath: string, options: StatementOptions): string {
    // Generate a simple hash based on statement type, CV file content, options, and template version
    const cvContent = fs.readFileSync(cvFilePath, 'utf-8');
    const stats = fs.statSync(cvFilePath);
    const optionsStr = JSON.stringify(options);
    
    // Include template version to invalidate cache when templates change
    // Updated: 2025-01-26 - New interview format with professional summary bullets, focus story, and "WHY company" section
    // Updated: 2025-01-26b - Enhanced WHY company section to include career goals alignment with job requirements
    // Updated: 2025-01-21 - Enforced strict 250-425 character limit for 'general' type with truncation
    const templateVersion = 'v2c-strict-length-2025-01-21';
    
    const combinedData = type + cvContent + stats.mtime.toISOString() + optionsStr + templateVersion;
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < combinedData.length; i++) {
      const char = combinedData.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(16).substring(0, 8);
  }

  private loadMostRecentMaterial(jobId: string, type: StatementType, options: StatementOptions = {}): string | null {
    try {
      const prepDir = resolveFromProjectRoot('logs', jobId, 'prep');

      if (!fs.existsSync(prepDir)) {
        return null;
      }

      const files = fs.readdirSync(prepDir);
      
      // Find all interview prep files for this type and person, get the most recent one
      const person = options.person || 'first';
      const materialFiles = files
        .filter(file => 
          file.startsWith(`interview-prep-${type}-${person}-`) && 
          file.endsWith('.json')
        )
        .sort()
        .reverse(); // Most recent first
      
      const mostRecentFile = materialFiles[0];

      if (!mostRecentFile) {
        return null;
      }

      const filePath = path.join(prepDir, mostRecentFile);
      const fileData = fs.readFileSync(filePath, 'utf-8');
      const parsedData = JSON.parse(fileData);
      
      // Return content if it exists and type matches
      if (parsedData.content && parsedData.type === type) {
        return parsedData.content;
      }
      
      return null;
    } catch (error) {
      // If any error occurs, return null
      return null;
    }
  }

  private loadCachedMaterial(
    jobId: string,
    type: StatementType,
    cvFilePath: string,
    options: StatementOptions
  ): string | null {
    try {
      const prepDir = resolveFromProjectRoot('logs', jobId, 'prep');

      if (!fs.existsSync(prepDir)) {
        return null;
      }

      const cacheKey = this.generateCacheKey(type, cvFilePath, options);
      const files = fs.readdirSync(prepDir);
      
      // Look for cached interview prep files and get the most recent one
      const person = options.person || 'first';
      const cacheFiles = files
        .filter(file => 
          file.startsWith(`interview-prep-${type}-${person}-${cacheKey}-`) && 
          file.endsWith('.json')
        )
        .sort()
        .reverse(); // Most recent first
      
      const cacheFile = cacheFiles[0];

      if (!cacheFile) {
        return null;
      }

      const cachePath = path.join(prepDir, cacheFile);
      const cacheData = fs.readFileSync(cachePath, 'utf-8');
      const parsedData = JSON.parse(cacheData);
      
      // Validate cache structure - ensure it has the cache key and correct type
      if (parsedData.content &&
          parsedData.type === type &&
          parsedData.cacheKey === cacheKey) {
        console.log(`📋 Cache hit: ${cachePath}`);
        return parsedData.content;
      }
      
      return null;
    } catch (error) {
      // If any error occurs in cache loading, return null to generate fresh content
      return null;
    }
  }

  private cacheMaterial(
    jobId: string,
    type: StatementType,
    content: string,
    cvFilePath: string,
    options: StatementOptions
  ): void {
    try {
      const prepDir = this.getJobPrepDir(jobId);

      const cacheKey = this.generateCacheKey(type, cvFilePath, options);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      const cacheData = {
        timestamp: new Date().toISOString(),
        jobId,
        type,
        content,
        characterCount: content.length,
        options,
        cvFilePath: path.basename(cvFilePath),
        cacheKey
      };

      const person = options.person || 'first';
      const cachePath = path.join(prepDir, `interview-prep-${type}-${person}-${cacheKey}-${timestamp}.json`);
      fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
      console.log(`📝 Interview material cached to: ${cachePath}`);

      // For cover-letter type, also save as a .txt file for easy access
      if (type === 'cover-letter') {
        const txtPath = path.join(prepDir, `blurb-${person}-${timestamp}.txt`);
        fs.writeFileSync(txtPath, content, 'utf-8');
        console.log(`📄 Blurb saved to: ${txtPath}`);
      }
    } catch (error) {
      console.warn(`⚠️  Failed to cache interview material: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Section-based storage methods for granular about-me generation
  getSectionFilePath(jobId: string, section: AboutMeSection): string {
    return path.join(this.getJobPrepDir(jobId), `about-me-${section}.json`);
  }

  saveSection(jobId: string, section: AboutMeSection, content: string, metadata?: Record<string, any>): void {
    try {
      const filePath = this.getSectionFilePath(jobId, section);
      const now = new Date().toISOString();
      
      // Load existing section if it exists to preserve version
      let existingData: AboutMeSectionData | null = null;
      if (fs.existsSync(filePath)) {
        try {
          const existingContent = fs.readFileSync(filePath, 'utf-8');
          existingData = JSON.parse(existingContent);
        } catch {
          // If we can't parse existing, start fresh
        }
      }

      const sectionData: AboutMeSectionData = {
        content,
        generatedAt: existingData?.generatedAt || now,
        lastModified: now,
        version: existingData ? existingData.version + 1 : 1,
        metadata: metadata || existingData?.metadata || {}
      };

      fs.writeFileSync(filePath, JSON.stringify(sectionData, null, 2));
      console.log(`📝 Saved ${section} section to: ${filePath}`);
    } catch (error) {
      console.warn(`⚠️  Failed to save ${section} section: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  loadSection(jobId: string, section: AboutMeSection): AboutMeSectionData | null {
    try {
      const prepPath = this.getSectionFilePath(jobId, section);
      const legacyPath = path.join(resolveFromProjectRoot('logs', jobId), `about-me-${section}.json`);
      const filePath = fs.existsSync(prepPath) ? prepPath : legacyPath;
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const sectionData: AboutMeSectionData = JSON.parse(content);
      return sectionData;
    } catch (error) {
      console.warn(`⚠️  Failed to load ${section} section: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  listSections(jobId: string): AboutMeSection[] {
    try {
      const prepDir = resolveFromProjectRoot('logs', jobId, 'prep');
      const legacyDir = resolveFromProjectRoot('logs', jobId);
      const searchDir = fs.existsSync(prepDir) ? prepDir : legacyDir;
      if (!fs.existsSync(searchDir)) {
        return [];
      }

      const files = fs.readdirSync(searchDir);
      const sections: AboutMeSection[] = [];

      const sectionTypes: AboutMeSection[] = ['hook', 'career-snapshot', 'themes', 'why', 'focus-story', 'close', 'personal-touch'];
      for (const section of sectionTypes) {
        const sectionFile = `about-me-${section}.json`;
        if (files.includes(sectionFile)) {
          sections.push(section);
        }
      }

      return sections;
    } catch (error) {
      console.warn(`⚠️  Failed to list sections: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  private cleanResponse(response: string, type: StatementType): string {
    // For about-me type, extract RTF content from code blocks if present
    if (type === 'about-me') {
      // Check if response is wrapped in markdown code blocks
      const codeBlockMatch = response.match(/```(?:rtf)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        // Extract content from code block
        return codeBlockMatch[1].trim();
      }
      // If no code block, just clean markdown formatting
      return response
        .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold formatting
        .replace(/\*(.*?)\*/g, '$1') // Remove italic formatting
        .trim();
    }

    // Remove any markdown formatting or extra text for other types
    let cleaned = response
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold formatting
      .replace(/\*(.*?)\*/g, '$1') // Remove italic formatting
      .trim();

    // For other types, ensure single paragraph format if needed
    if (type === 'general') {
      cleaned = cleaned.replace(/\n\n+/g, ' ').replace(/\n/g, ' ');

      // ENFORCE length constraint: 250-425 characters
      const maxLength = 425;
      const minLength = 250;

      if (cleaned.length > maxLength) {
        console.warn(`⚠️  Generated content exceeds maximum length (${cleaned.length} chars). Truncating to ${maxLength} chars.`);
        // Find a good breaking point (end of sentence) near the max length
        const truncateAt = cleaned.lastIndexOf('.', maxLength);
        if (truncateAt > minLength && truncateAt < maxLength) {
          cleaned = cleaned.substring(0, truncateAt + 1).trim();
        } else {
          // If no good sentence break, just hard truncate
          cleaned = cleaned.substring(0, maxLength).trim();
          // Add ellipsis if we cut off mid-sentence
          if (!cleaned.endsWith('.') && !cleaned.endsWith('!') && !cleaned.endsWith('?')) {
            cleaned += '...';
          }
        }
        console.log(`✂️  Truncated to ${cleaned.length} characters`);
      }

      if (cleaned.length < minLength) {
        console.warn(`⚠️  Generated content is shorter than minimum length (${cleaned.length} chars < ${minLength} chars)`);
      }
    }

    return cleaned;
  }

  private convertMarkdownToUnicode(text: string): string {
    // Convert markdown bullet points to Mac Notes-compatible format
    return text
      // Convert main bullets (- or * at start of line) to bullet points
      .replace(/^[\-\*]\s+(.+)$/gm, '• $1')
      // Convert nested bullets (2+ spaces + - or *) to tab-indented sub-bullets
      .replace(/^  [\-\*]\s+(.+)$/gm, '\t• $1')
      // Convert deeper nested bullets (4+ spaces + - or *) to double-tab indented
      .replace(/^    [\-\*]\s+(.+)$/gm, '\t\t• $1');
  }

  async extractThemes(jobId: string): Promise<ThemeExtractionResult> {
    try {
      // Load job data
      const jobData = this.loadJobData(jobId);
      
      // Extract themes using Claude
      const themes = await this.extractJobThemes(jobData);
      
      // Log themes to file
      this.logThemes(jobId, themes);
      
      // Console log themes
      this.displayThemes(themes);
      
      return {
        success: true,
        jobId,
        themes,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date().toISOString()
      };
    }
  }

  private async extractJobThemes(job: JobListing): Promise<JobTheme[]> {
    const prompt = `Analyze the following job posting and extract 3-5 priority themes that are most important for this role. For each theme, provide:
1. A clear, concise name (2-4 words)
2. A brief definition overview (1-2 sentences explaining what this theme means in the context of this role)
3. Importance level (high, medium, low)

Focus on the core competencies, skills, and qualities that would be essential for success in this position.

Job Title: ${job.title}
Company: ${job.company}
Description: ${job.description}

Please respond in the following JSON format:
{
  "themes": [
    {
      "name": "Theme Name",
      "definition": "Brief definition explaining what this theme means for this role...",
      "importance": "high"
    }
  ]
}`;

    console.log('🎯 Extracting priority themes from job description...');
    
    const response = await this.makeClaudeRequest(prompt);
    
    try {
      // Clean the response to extract JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Claude response');
      }
      
      const parsedResponse = JSON.parse(jsonMatch[0]);
      
      if (!parsedResponse.themes || !Array.isArray(parsedResponse.themes)) {
        throw new Error('Invalid themes format in response');
      }
      
      return parsedResponse.themes;
    } catch (parseError) {
      console.warn('⚠️  Failed to parse themes response, using fallback');
      // Return fallback themes if parsing fails
      return [
        {
          name: "Technical Expertise",
          definition: "Core technical skills and domain knowledge required for the role.",
          importance: "high" as const
        },
        {
          name: "Leadership & Communication",
          definition: "Ability to lead teams and communicate effectively across stakeholders.",
          importance: "high" as const
        },
        {
          name: "Problem Solving",
          definition: "Analytical thinking and ability to solve complex challenges.",
          importance: "medium" as const
        }
      ];
    }
  }

  private logThemes(jobId: string, themes: JobTheme[]): void {
    try {
      const prepDir = this.getJobPrepDir(jobId);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const themeData = {
        timestamp: new Date().toISOString(),
        jobId,
        themes,
        extractedAt: new Date().toISOString()
      };

      const themesPath = path.join(prepDir, `themes-${timestamp}.json`);
      fs.writeFileSync(themesPath, JSON.stringify(themeData, null, 2));
      console.log(`📝 Themes logged to: ${themesPath}`);
    } catch (error) {
      console.warn(`⚠️  Failed to log themes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private displayThemes(themes: JobTheme[]): void {
    console.log('\n🎯 Priority Themes Extracted:');
    console.log('=' .repeat(50));
    
    themes.forEach((theme, index) => {
      const importanceIcon = theme.importance === 'high' ? '🔴' : 
                           theme.importance === 'medium' ? '🟡' : '🟢';
      
      console.log(`\n${index + 1}. ${importanceIcon} ${theme.name} (${theme.importance.toUpperCase()})`);
      console.log(`   ${theme.definition}`);
    });
    
    console.log('\n' + '=' .repeat(50));
  }

  private async getOrExtractThemes(job: JobListing): Promise<JobTheme[]> {
    // First, check if themes already exist for this job
    const existingThemes = this.loadExistingThemes(job.title, job.company);
    
    if (existingThemes && existingThemes.length > 0) {
      console.log('📋 Using existing themes for about-me generation');
      return existingThemes;
    }
    
    // If no existing themes, extract them
    console.log('🎯 No existing themes found, extracting themes for about-me generation...');
    return await this.extractJobThemes(job);
  }

  private loadExistingThemes(jobTitle: string, jobCompany: string): JobTheme[] | null {
    try {
      // Look for theme files that match this job (by checking all job directories)
      const logsDir = resolveFromProjectRoot('logs');
      if (!fs.existsSync(logsDir)) {
        return null;
      }

      const jobDirs = fs.readdirSync(logsDir);

      for (const jobDir of jobDirs) {
        const jobDirPath = path.join(logsDir, jobDir);
        if (!fs.statSync(jobDirPath).isDirectory()) continue;

        const prepDirPath = path.join(jobDirPath, 'prep');
        const searchDir = fs.existsSync(prepDirPath) ? prepDirPath : jobDirPath;

        // Check if this directory has theme files
        const files = fs.readdirSync(searchDir);
        const themeFiles = files
          .filter(file => file.startsWith('themes-') && file.endsWith('.json'))
          .sort()
          .reverse(); // Most recent first

        if (themeFiles.length > 0) {
          // Load the most recent theme file and check if it matches this job
          const themeFilePath = path.join(searchDir, themeFiles[0]);
          const themeData = JSON.parse(fs.readFileSync(themeFilePath, 'utf-8'));

          // Check if we can find a job file in the job root directory to compare
          const rootFiles = fs.readdirSync(jobDirPath);
          const jobFiles = rootFiles.filter(file => file.startsWith('job-') && file.endsWith('.json'));
          if (jobFiles.length > 0) {
            const jobFilePath = path.join(jobDirPath, jobFiles[0]);
            const jobData = JSON.parse(fs.readFileSync(jobFilePath, 'utf-8'));

            // If title and company match, use these themes
            if (jobData.title === jobTitle && jobData.company === jobCompany) {
              return themeData.themes;
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.warn('⚠️  Failed to load existing themes, will extract new ones');
      return null;
    }
  }

  private async enrichThemesWithExamples(themes: JobTheme[], cvContent: string, job: JobListing, userTheme?: string): Promise<JobTheme[]> {
    console.log('🔍 Analyzing CV examples for each theme...');
    
    const userThemeGuidance = userTheme ? 
      `\n**SPECIAL FOCUS**: When selecting the BEST examples and interview stories, prioritize those that demonstrate or relate to "${userTheme}" theme. This should influence your selection of the most compelling focal story for the FOCUS STORY section.\n` : 
      '';

    const prompt = `Analyze the provided CV content and identify 1-2 specific, quantifiable examples for each theme that demonstrate the candidate's relevant experience. For each example, extract:

1. The specific text/achievement from the CV
2. The source section (which job/project it came from)
3. The quantified impact/result

Additionally, identify the 2-3 BEST examples overall that demonstrate the highest professional impact and would make compelling interview stories.${userThemeGuidance}

Themes to match:
${themes.map((theme, index) => `${index + 1}. **${theme.name}**: ${theme.definition}`).join('\n')}

CV Content:
${cvContent}

Respond in this JSON format:
{
  "themeExamples": [
    {
      "themeName": "Theme Name",
      "examples": [
        {
          "text": "Specific achievement from CV",
          "source": "Company/Role where this happened",
          "impact": "Quantified result (e.g., '35% improvement', '$1M revenue')"
        }
      ]
    }
  ],
  "highlightedExamples": [
    {
      "text": "Most impactful achievement",
      "source": "Source role/company",
      "impact": "Quantified impact",
      "isHighlighted": true
    }
  ],
  "interviewStories": [
    "Brief story description suitable for STAR method interview response..."
  ]
}`;

    const response = await this.makeClaudeRequest(prompt);
    
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('⚠️  Failed to extract examples, using themes without examples');
        return themes;
      }
      
      const parsedResponse = JSON.parse(jsonMatch[0]);
      
      // Merge examples back into themes
      const enrichedThemes = themes.map(theme => {
        const themeData = parsedResponse.themeExamples?.find(
          (te: any) => te.themeName === theme.name
        );
        
        return {
          ...theme,
          examples: themeData?.examples || []
        };
      });
      
      // Store highlighted examples and stories for later use
      this.tempHighlightedExamples = parsedResponse.highlightedExamples || [];
      this.tempInterviewStories = parsedResponse.interviewStories || [];
      
      return enrichedThemes;
    } catch (parseError) {
      console.warn('⚠️  Failed to parse examples response, using themes without examples');
      return themes;
    }
  }

  private tempHighlightedExamples: ThemeExample[] = [];
  private tempInterviewStories: string[] = [];

  private async updateThemesWithExamples(job: JobListing, themesWithExamples: JobTheme[], actualJobId?: string): Promise<void> {
    try {
      const jobId = actualJobId || this.currentJobId;
      const prepDir = this.getJobPrepDir(jobId);

      // Find the most recent themes file
      const files = fs.readdirSync(prepDir);
      const themeFiles = files
        .filter(file => file.startsWith('themes-') && file.endsWith('.json'))
        .sort()
        .reverse();

      if (themeFiles.length > 0) {
        // Update the most recent themes file
        const themeFilePath = path.join(prepDir, themeFiles[0]);
        const existingData = JSON.parse(fs.readFileSync(themeFilePath, 'utf-8'));

        const updatedData = {
          ...existingData,
          themes: themesWithExamples,
          highlightedExamples: this.tempHighlightedExamples,
          interviewStories: this.tempInterviewStories,
          lastEnrichedAt: new Date().toISOString()
        };

        fs.writeFileSync(themeFilePath, JSON.stringify(updatedData, null, 2));
        console.log(`📝 Updated themes file with examples: ${themeFilePath}`);
      } else {
        // Create new themes file with examples
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const themeData = {
          timestamp: new Date().toISOString(),
          jobId,
          themes: themesWithExamples,
          highlightedExamples: this.tempHighlightedExamples,
          interviewStories: this.tempInterviewStories,
          extractedAt: new Date().toISOString()
        };

        const themesPath = path.join(prepDir, `themes-${timestamp}.json`);
        fs.writeFileSync(themesPath, JSON.stringify(themeData, null, 2));
        console.log(`📝 Created themes file with examples: ${themesPath}`);
      }
    } catch (error) {
      console.warn(`⚠️  Failed to update themes with examples: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private getJobIdFromJob(job: JobListing): string {
    // Generate unique job ID using timestamp + random for guaranteed uniqueness
    const timestamp = Date.now().toString(16);
    const random = Math.random().toString(16).substring(2, 6);
    const combined = timestamp + random;
    return combined.substring(combined.length - 8);
  }

  private injectThemesIntoPrompt(promptTemplate: string, themes: JobTheme[]): string {
    // Create a formatted list of themes to inject, including examples
    const themesList = themes
      .map((theme, index) => {
        let themeText = `${index + 1}. **${theme.name}**: ${theme.definition}`;
        
        if (theme.examples && theme.examples.length > 0) {
          themeText += '\n   Examples from CV:';
          theme.examples.forEach((example, exIndex) => {
            themeText += `\n   - ${example.text} (${example.impact})`;
          });
        }
        
        return themeText;
      })
      .join('\n\n');
    
    // Replace the line about extracting themes with a directive to use the provided themes
    const updatedPrompt = promptTemplate.replace(
      '1. Use the priority themes provided (these have been automatically extracted from the job description)',
      `1. Use the following priority themes and their associated examples from the candidate's CV:\n\n${themesList}\n\nUse the provided examples to craft compelling bullet points. Focus on the themes marked as "high" importance first, then include medium importance themes if space allows.`
    );
    
    return updatedPrompt;
  }

  async getInterviewStories(jobId: string): Promise<{ success: boolean; stories?: string[]; highlightedExamples?: ThemeExample[]; error?: string }> {
    try {
      const prepDir = this.getJobPrepDir(jobId);

      const files = fs.readdirSync(prepDir);
      const themeFiles = files
        .filter(file => file.startsWith('themes-') && file.endsWith('.json'))
        .sort()
        .reverse();

      if (themeFiles.length === 0) {
        return { success: false, error: 'No themes file found. Run theme extraction first.' };
      }

      const themeFilePath = path.join(prepDir, themeFiles[0]);
      const themeData = JSON.parse(fs.readFileSync(themeFilePath, 'utf-8'));

      if (!themeData.interviewStories && !themeData.highlightedExamples) {
        return { success: false, error: 'No interview stories found. Run about-me generation to extract stories.' };
      }

      return {
        success: true,
        stories: themeData.interviewStories || [],
        highlightedExamples: themeData.highlightedExamples || []
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  // Profile Generation Methods (TypeScript versions of Google Apps Script)
  
  private where(): string {
    return this.profileConfig.location;
  }

  private who(): string {
    return this.profileConfig.role;
  }

  private focus(): string {
    return [
      "My track record is in",
      this.profileConfig.domainOfExcellence,
      "but I've been self-teaching around GenAI and am excited about",
      this.profileConfig.domains.join('/') + "."
    ].join(' ');
  }

  private why(): string {
    return [
      `Ideal team-size is ${this.profileConfig.teamSize}.`,
      `Ideal stack includes ${this.profileConfig.preferredStack.join('/')} on ${this.profileConfig.preferredStack.includes('GCP') ? 'GCP' : 'cloud'}.`
    ].join(" ");
  }

  private whatAndWhere(): string {
    const minSalary = this.getMinSalary();
    return [
      "looking for a full-time role ",
      "leading full-stack development as CTO/HoE/VPE at Seed/Series A or as DIR/Sr. EM at later stage",
      ", preferably " + this.where() + ". ",
      `Min base salary of $${(minSalary / 1000)}K; more if 5d/in-office. `,
      this.focus(), " "
    ].join('');
  }

  private generateProfile(): string {
    let result = '';
    result += this.who() + " ";
    result += this.whatAndWhere() + " ";
    result += this.why() + " ";
    return result.trim();
  }

  async createProfile(): Promise<ProfileResult> {
    try {
      const profile = this.generateProfile();
      const googleScript = this.transpileToGoogleScript();
      
      // Save to file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const profilePath = path.resolve('logs', `profile-${timestamp}.txt`);
      const scriptPath = path.resolve('logs', `google-script-${timestamp}.js`);
      
      fs.writeFileSync(profilePath, profile);
      fs.writeFileSync(scriptPath, googleScript);
      
      console.log(`📝 Profile saved to: ${profilePath}`);
      console.log(`📄 Google Script saved to: ${scriptPath}`);
      console.log('📋 Google Script ready to copy-paste into Apps Script');
      
      return {
        success: true,
        profile,
        googleScript
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  private transpileToGoogleScript(): string {
    const config = this.profileConfig;
    const minSalary = this.getMinSalary();
    
    return `function where() {
  return "${config.location}";
}

function who() {
  return "${config.role}";
}

function whatAndWhere() {
  return [
    "looking for a full-time role ", 
    "leading full-stack development as CTO/HoE/VPE at Seed/Series A or as DIR/Sr. EM at later stage",
    ", preferably " + where() + ". ",
    "Min base salary of $${(minSalary / 1000)}K; more if 5d/in-office. ",
    focus(), " "
  ].join('');
}

function why() {
  return [
    "Ideal team-size is ${config.teamSize}.",
    "Ideal stack includes ${config.preferredStack.join('/')} on ${config.preferredStack.includes('GCP') ? 'GCP' : 'cloud'}."
  ].join(" ");
}

const DOMAINS = [
  ${config.domains.map(d => `'${d}'`).join(',\n  ')}
];

// const domainOfExcellence = "${config.domainOfExcellence}";

function focus() {
  return [
    "My track record is in",
    domainOfExcellence,
    "but I've been self-teaching around GenAI and am excited about",
    DOMAINS.join('/') + "."
  ].join(' ');
}

function cmf2() {
  var result = '';
  
  result += who() + " ";
  result += whatAndWhere() + " ";
  result += why() + " ";
  
  console.log(result);
  return result;
}`;
  }

  updateProfileConfig(config: Partial<ProfileConfig>): void {
    this.profileConfig = { ...this.profileConfig, ...config };
  }

  getProfileConfig(): ProfileConfig {
    return { ...this.profileConfig };
  }

  async extractProject(jobId: string, projectIndex: number): Promise<ProjectExtractionResult> {
    try {
      // Load themes data for the job
      const themesData = this.loadThemesData(jobId);
      if (!themesData) {
        return {
          success: false,
          error: 'No themes data found for this job ID. Run theme extraction first.'
        };
      }

      // Extract project from examples
      const project = this.extractProjectFromExamples(themesData, projectIndex);
      if (!project) {
        return {
          success: false,
          error: `Project ${projectIndex} not found in themes data. Available projects: ${this.getAvailableProjectsCount(themesData)}`
        };
      }

      // Format for form fields
      const formattedOutput = this.formatProjectForForm(project);

      return {
        success: true,
        project,
        formattedOutput
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  private loadThemesData(jobId: string): any {
    try {
      const prepDir = this.getJobPrepDir(jobId);

      const files = fs.readdirSync(prepDir);
      const themeFiles = files
        .filter(file => file.startsWith('themes-') && file.endsWith('.json'))
        .sort()
        .reverse();

      if (themeFiles.length === 0) {
        return null;
      }

      const themeFilePath = path.join(prepDir, themeFiles[0]);
      const themeData = JSON.parse(fs.readFileSync(themeFilePath, 'utf-8'));

      return themeData;
    } catch (error) {
      return null;
    }
  }

  private extractProjectFromExamples(themesData: any, projectIndex: number): ProjectInfo | null {
    const allExamples: (ThemeExample & { themeName?: string })[] = [];
    
    // Collect all examples from all themes
    if (themesData.themes) {
      themesData.themes.forEach((theme: JobTheme) => {
        if (theme.examples) {
          theme.examples.forEach((example: ThemeExample) => {
            allExamples.push({
              ...example,
              themeName: theme.name
            });
          });
        }
      });
    }

    // Add highlighted examples
    if (themesData.highlightedExamples) {
      themesData.highlightedExamples.forEach((example: ThemeExample) => {
        allExamples.push({
          ...example,
          isHighlighted: true
        });
      });
    }

    if (projectIndex < 1 || projectIndex > allExamples.length) {
      return null;
    }

    const selectedExample = allExamples[projectIndex - 1];
    return this.convertExampleToProject(selectedExample);
  }

  private convertExampleToProject(example: ThemeExample & { themeName?: string }): ProjectInfo {
    // Parse company and role from source field
    const sourceMatch = example.source.match(/(.*?)\s*@\s*(.*)/);
    const role = sourceMatch ? sourceMatch[1].trim() : 'Senior Engineer';
    const company = sourceMatch ? sourceMatch[2].trim() : example.source;

    // Generate project components
    const title = this.generateProjectTitle(example.text);
    const industry = this.mapToIndustry(company, example.text);
    const projectType = this.mapToProjectType(example.text);
    const duration = this.mapToDuration(example.text);
    const organizationSize = this.estimateOrganizationSize(example.text, company);
    const functionArea = this.mapToFunction(role, example.text);
    const location = this.estimateLocation(company);
    
    // Parse Problem-Action-Result structure
    const { problem, action, result } = this.parseProjectSummary(example.text, example.impact);

    return {
      title,
      industry,
      projectType,
      duration,
      organizationSize,
      function: functionArea,
      location,
      problem,
      action,
      result
    };
  }

  private mapToIndustry(company: string, text: string): string {
    const companyLower = company.toLowerCase();
    const textLower = text.toLowerCase();
    
    // SaaS/Technology companies
    if (companyLower.includes('myna') || companyLower.includes('coursekey') || 
        textLower.includes('saas') || textLower.includes('platform')) {
      return 'Technology/SaaS';
    }
    
    // E-commerce/Retail
    if (companyLower.includes('decorist') || textLower.includes('marketplace') ||
        textLower.includes('e-commerce') || textLower.includes('retail')) {
      return 'E-commerce/Retail';
    }
    
    // AI/Machine Learning
    if (textLower.includes('ai') || textLower.includes('llm') || textLower.includes('genai')) {
      return 'Artificial Intelligence';
    }
    
    // Default
    return 'Technology';
  }

  private mapToProjectType(text: string): string {
    const textLower = text.toLowerCase();
    
    if (textLower.includes('transform') || textLower.includes('restructur') || textLower.includes('organization')) {
      return 'Organizational Transformation';
    } else if (textLower.includes('ai') || textLower.includes('llm') || textLower.includes('genai')) {
      return 'Technology Implementation';
    } else if (textLower.includes('platform') || textLower.includes('system') || textLower.includes('architecture')) {
      return 'Platform Development';
    } else if (textLower.includes('security') || textLower.includes('cve')) {
      return 'Security Enhancement';
    } else if (textLower.includes('team') || textLower.includes('leadership') || textLower.includes('scale')) {
      return 'Team Development';
    } else if (textLower.includes('process') || textLower.includes('workflow') || textLower.includes('efficiency')) {
      return 'Process Improvement';
    } else {
      return 'Strategic Initiative';
    }
  }

  private mapToDuration(text: string): '0-6 Months' | '6-12 Months' | '12-24 Months' | '24+ Months' {
    const textLower = text.toLowerCase();
    
    // Look for specific time indicators
    if (textLower.includes('quarter') || textLower.includes('3 month')) {
      return '0-6 Months';
    } else if (textLower.includes('year') || textLower.includes('12 month')) {
      return '6-12 Months';
    } else if (textLower.includes('18 month') || textLower.includes('2 year')) {
      return '12-24 Months';
    } else if (textLower.includes('multi-year') || textLower.includes('long-term')) {
      return '24+ Months';
    }
    
    // Default based on project complexity
    if (textLower.includes('transform') || textLower.includes('restructur')) {
      return '6-12 Months';
    } else {
      return '0-6 Months';
    }
  }

  private estimateOrganizationSize(text: string, company: string): string {
    const textLower = text.toLowerCase();
    const companyLower = company.toLowerCase();
    
    // Look for team size indicators
    if (textLower.includes('32') || textLower.includes('50')) {
      return 'Large (1000+ employees)';
    } else if (textLower.includes('19') || textLower.includes('20')) {
      return 'Medium (100-999 employees)';
    } else if (companyLower.includes('startup') || companyLower.includes('seed') || textLower.includes('small team')) {
      return 'Small (10-99 employees)';
    }
    
    // Company-specific knowledge
    if (companyLower.includes('myna') || companyLower.includes('coursekey')) {
      return 'Small (10-99 employees)';
    } else if (companyLower.includes('decorist')) {
      return 'Medium (100-999 employees)';
    }
    
    return 'Medium (100-999 employees)';
  }

  private mapToFunction(role: string, text: string): string {
    const roleLower = role.toLowerCase();
    const textLower = text.toLowerCase();
    
    if (roleLower.includes('cto') || roleLower.includes('chief')) {
      return 'Executive Leadership';
    } else if (roleLower.includes('vp') || roleLower.includes('vice president')) {
      return 'Senior Management';
    } else if (roleLower.includes('director') || roleLower.includes('head')) {
      return 'Management';
    } else if (textLower.includes('engineering') || textLower.includes('technical')) {
      return 'Engineering';
    } else if (textLower.includes('product')) {
      return 'Product Management';
    } else {
      return 'Technology';
    }
  }

  private estimateLocation(company: string): string {
    // For now, default to remote/hybrid as that's common for tech roles
    // Could be enhanced with company-specific data
    return 'Remote/Hybrid';
  }

  private parseProjectSummary(text: string, impact: string): { problem: string; action: string; result: string } {
    // Try to parse the example text into Problem-Action-Result structure
    const textLower = text.toLowerCase();
    
    let problem = '';
    let action = '';
    let result = impact;
    
    // Identify problem indicators
    if (textLower.includes('transform') || textLower.includes('restructur')) {
      problem = 'Organization structure was inefficient and limiting productivity';
      action = text;
    } else if (textLower.includes('security') || textLower.includes('cve')) {
      problem = 'Security vulnerabilities needed systematic remediation';
      action = text;
    } else if (textLower.includes('ai') || textLower.includes('llm') || textLower.includes('genai')) {
      problem = 'Manual processes required automation to improve efficiency';
      action = text;
    } else if (textLower.includes('platform') || textLower.includes('system')) {
      problem = 'System architecture needed modernization for scale';
      action = text;
    } else {
      // Generic case
      problem = 'Organization needed technical leadership to drive strategic initiatives';
      action = text;
    }
    
    return { problem, action, result };
  }

  private generateProjectTitle(text: string): string {
    // Try to extract a meaningful title from the text
    if (text.includes('LLM') || text.includes('GenAI') || text.includes('AI')) {
      return 'AI/LLM Implementation Project';
    } else if (text.includes('transform') || text.includes('restructur')) {
      return 'Engineering Transformation Initiative';
    } else if (text.includes('platform') || text.includes('system')) {
      return 'Platform Development Project';
    } else if (text.includes('security') || text.includes('CVE')) {
      return 'Security Enhancement Project';
    } else if (text.includes('team') || text.includes('organization')) {
      return 'Team Leadership & Scaling';
    } else {
      return 'Strategic Engineering Initiative';
    }
  }


  private getAvailableProjectsCount(themesData: any): number {
    let count = 0;
    
    if (themesData.themes) {
      themesData.themes.forEach((theme: JobTheme) => {
        if (theme.examples) {
          count += theme.examples.length;
        }
      });
    }

    if (themesData.highlightedExamples) {
      count += themesData.highlightedExamples.length;
    }

    return count;
  }

  private formatProjectForForm(project: ProjectInfo): string {
    return `Project Title:
${project.title}

Industry:
${project.industry}

Project Type:
${project.projectType}

Project Duration:
${project.duration}

Size of Organization:
${project.organizationSize}

Function:
${project.function}

Location:
${project.location}

Project Summary Problem:
${project.problem}

Project Summary Action:
${project.action}

Project Summary Result:
${project.result}`;
  }

  async listAvailableProjects(jobId: string): Promise<{ success: boolean; projects?: string[]; count?: number; error?: string }> {
    try {
      const themesData = this.loadThemesData(jobId);
      if (!themesData) {
        return {
          success: false,
          error: 'No themes data found for this job ID. Run theme extraction first.'
        };
      }

      const projects: string[] = [];
      let index = 1;

      // List examples from themes
      if (themesData.themes) {
        themesData.themes.forEach((theme: JobTheme) => {
          if (theme.examples) {
            theme.examples.forEach((example: ThemeExample) => {
              const title = this.generateProjectTitle(example.text);
              const company = example.source.includes('@') ? example.source.split('@')[1].trim() : example.source;
              projects.push(`${index}. ${title} (${company})`);
              index++;
            });
          }
        });
      }

      // List highlighted examples
      if (themesData.highlightedExamples) {
        themesData.highlightedExamples.forEach((example: ThemeExample) => {
          const title = this.generateProjectTitle(example.text);
          const company = example.source.includes('@') ? example.source.split('@')[1].trim() : example.source;
          projects.push(`${index}. ${title} (${company}) [HIGHLIGHTED]`);
          index++;
        });
      }

      return {
        success: true,
        projects,
        count: projects.length
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  private async determineFocalThemeFromJob(job: JobListing): Promise<string> {
    // Return cached theme if already determined
    if (this.cachedFocalTheme !== null) {
      console.log(`✅ Using previously determined focal theme: "${this.cachedFocalTheme}"`);
      return this.cachedFocalTheme;
    }

    console.log('\n🎯 Focus Story Generation - Determining focal theme from job description...');

    const themes = await this.extractJobThemes(job);

    // Pick the top "high" importance theme, falling back to the first theme
    const topTheme = themes.find(t => t.importance === 'high') || themes[0];
    const theme = topTheme ? topTheme.name : '';

    // Cache for subsequent calls
    this.cachedFocalTheme = theme;

    if (theme) {
      console.log(`✅ Auto-selected focal story theme: "${theme}"`);
    } else {
      console.log('📋 No theme identified; will focus on general high-impact stories');
    }
    console.log('');

    return theme;
  }

  private async generateStandaloneFocusStory(jobId: string, cvFilePath: string, regenerate: boolean): Promise<StatementResult> {
    try {
      // Check if we should use cached content or regenerate
      if (!regenerate) {
        const cachedContent = this.loadCachedFocusStory(jobId, cvFilePath);
        if (cachedContent) {
          console.log(`📋 Using cached focus story for job ${jobId}`);
          return {
            success: true,
            content: cachedContent,
            type: 'focus' as StatementType,
            characterCount: cachedContent.length
          };
        }
      }

      // Load company values
      const companyValues = await this.loadCompanyValues(jobId);
      if (!companyValues) {
        return {
          success: false,
          error: 'Unable to load or research company values. Please create company-values.txt file manually or provide a valid company URL.',
          type: 'focus' as StatementType
        };
      }

      // Load CV content
      const cvContent = fs.readFileSync(cvFilePath, 'utf-8');

      // Determine focal theme from job description
      const jobData = this.loadJobData(jobId);
      const theme = await this.determineFocalThemeFromJob(jobData);

      // Generate the focus story
      console.log(`🎯 Analyzing CV line items for focus story generation...`);
      console.log(`📋 Parsing role-specific achievements and reverse-engineering STAR method stories...`);
      const focusStory = await this.createFocusStory(companyValues, cvContent, jobId, theme);

      // Cache the generated story
      this.cacheFocusStory(jobId, focusStory, cvFilePath);

      return {
        success: true,
        content: focusStory,
        type: 'focus' as StatementType,
        characterCount: focusStory.length
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        type: 'focus' as StatementType
      };
    }
  }

  private async loadCompanyValues(jobId: string, providedCompanyUrl?: string): Promise<string | null> {
    try {
      const prepDir = this.getJobPrepDir(jobId);
      const valuesPath = path.join(prepDir, 'company-values.txt');
      // Legacy fallback: check flat jobDir for pre-migration files
      const legacyValuesPath = resolveFromProjectRoot('logs', jobId, 'company-values.txt');

      for (const p of [valuesPath, legacyValuesPath]) {
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, 'utf-8').trim();
          if (content.length > 0) {
            // Migrate to prepDir if reading from legacy path
            if (p === legacyValuesPath && p !== valuesPath) {
              fs.writeFileSync(valuesPath, content);
              console.log(`📋 Migrated company-values.txt to prep/`);
            }
            return content;
          }
        }
      }

      // Not found - research and create it
      console.log('📋 No company-values.txt found. Researching company values...');
      const companyValues = await this.researchCompanyValues(jobId, providedCompanyUrl);

      if (companyValues) {
        fs.writeFileSync(valuesPath, companyValues);
        console.log(`✅ Company values researched and saved to: ${valuesPath}`);
        return companyValues;
      }

      return null;
    } catch (error) {
      console.warn(`⚠️  Failed to load company values: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  private async researchCompanyValues(jobId: string, providedCompanyUrl?: string): Promise<string | null> {
    try {
      // Load job data to get company name
      const jobData = this.loadJobData(jobId);
      const companyName = jobData.company;

      console.log(`🔍 Researching company values for: ${companyName}`);

      // Use provided URL if available, otherwise prompt user
      let companyUrl: string | null = providedCompanyUrl || null;
      if (!companyUrl) {
        companyUrl = await this.promptForCompanyUrl(companyName);
        if (!companyUrl) {
          console.log('⏭️  Skipping company values research - no URL provided');
          return null;
        }
      } else {
        console.log(`🌐 Using provided company URL: ${companyUrl}`);
      }

      console.log(`🌐 Fetching company website: ${companyUrl}`);
      
      // Fetch and analyze the company website
      const htmlContent = await WebScraper.fetchHtml(companyUrl);
      
      // Use Claude to extract and synthesize company values
      const companyValues = await this.synthesizeCompanyValues(companyName, htmlContent, companyUrl);
      
      return companyValues;
    } catch (error) {
      console.warn(`⚠️  Failed to research company values: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  private async promptForCompanyUrl(companyName: string): Promise<string | null> {
    // Return cached company URL if already asked
    if (this.cachedCompanyUrl !== null) {
      if (this.cachedCompanyUrl === '') {
        // User previously chose to skip
        console.log('⏭️  Using previous choice: skipping company URL (Enter was pressed previously)');
        return null;
      }
      console.log(`✅ Using previously provided company URL: "${this.cachedCompanyUrl}"`);
      return this.cachedCompanyUrl;
    }

    // Check if stdin is available and is a TTY (interactive terminal)
    if (!process.stdin.isTTY) {
      console.log('⏭️  Skipping interactive company URL prompt (non-TTY environment)');
      return null;
    }

    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      console.log('');
      console.log('🏢 Company Values Research');
      console.log('=========================');
      console.log(`To generate tailored interview responses, I need to research ${companyName}'s company values.`);
      console.log('');

      rl.question(`Please provide the company website URL (or press Enter to skip): `, (url) => {
        rl.close();
        const trimmedUrl = url.trim();

        // Cache the company URL (or empty string if skipped)
        this.cachedCompanyUrl = trimmedUrl || '';

        resolve(trimmedUrl || null);
      });
    });
  }

  private async synthesizeCompanyValues(companyName: string, htmlContent: string, companyUrl: string): Promise<string> {
    const prompt = `You are analyzing a company website to extract and synthesize their core company values for interview preparation. Your goal is to identify 3-5 key company values that would be most relevant for a candidate preparing for interviews.

Company: ${companyName}
Website URL: ${companyUrl}

Website Content (HTML):
${htmlContent.substring(0, 15000)} ${htmlContent.length > 15000 ? '...[truncated]' : ''}

Instructions:
1. Analyze the website content for explicit company values, mission statements, culture descriptions, and "about us" sections
2. Look for recurring themes in job postings, blog posts, leadership messages, and company descriptions
3. Identify implicit values from the language and tone used throughout the site
4. Synthesize 3-5 core company values that would be most important for interview preparation
5. For each value, provide a 1-2 sentence description that explains what it means in practice

IMPORTANT: Return ONLY the bulleted list of values and descriptions. Do not include any introductory text, concluding remarks, or additional context.

Format your response exactly like this:

**Innovation**: Description of what innovation means to this company and how it's demonstrated.

**Customer-Centricity**: Description of their approach to customers and why this matters.

**Collaboration**: Description of how they work together and their teamwork philosophy.

Keep each description concise but specific enough to be actionable for interview preparation. Focus on values that would be most relevant for someone interviewing for an engineering leadership role.`;

    try {
      const response = await this.makeClaudeRequest(prompt);
      return response.trim();
    } catch (error) {
      throw new Error(`Failed to synthesize company values: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async createFocusStory(companyValues: string, cvContent: string, jobId: string, theme: string = ''): Promise<string> {
    // Load job data for relevance section
    const jobData = this.loadJobData(jobId);
    
    const prompt = `You are an expert interview coach helping identify specific line items/bullet points from the candidate's CV roles and reverse-engineering them into compelling STAR method stories that align with company values.

Job Information:
Title: ${jobData.title}
Company: ${jobData.company}
Description: ${jobData.description}

Company Values:
${companyValues}

Candidate's Work History (CV):
${cvContent}

${theme ? `THEME FOCUS: When evaluating line items, prioritize those that best demonstrate experience with "${theme}". Look for achievements, challenges, and outcomes that relate to this theme.` : ''}

Your task:
1. **IDENTIFY LINE ITEM CANDIDATES**: Parse through each role in the CV and extract specific bullet points/achievements that could be expanded into stories
2. **EVALUATE ALIGNMENT**: For each line item, assess how well it could demonstrate the company values and fit the job requirements
3. **SELECT THE BEST**: Choose the single line item that has the highest potential to demonstrate the MOST company values simultaneously${theme ? `, with preference for stories that showcase "${theme}"` : ''}
4. **REVERSE-ENGINEER STAR**: Expand the chosen line item into a full STAR method story by inferring the likely Situation, Task, Actions, and Results
5. **CONNECT TO ROLE**: Explicitly tie the story back to how it demonstrates fit for this specific job and company
6. **PROVIDE ALTERNATIVES**: Include 2-3 alternative line items that were strong candidates

IMPORTANT: Please respond directly in Rich Text Format (RTF) code. Do not use markdown formatting. Use RTF control codes for formatting and nested bullet lists with up to five levels of nesting.

Please respond in RTF format using the following structure:

{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;}}
\\par \\li720 \\bullet \\b EXECUTIVE SUMMARY:\\b0
\\par \\li1080 \\bullet [Create 2-3 bullet points following the format "<IMPACT> over <TIMEFRAME> as <ROLE>"]
\\par \\li1080 \\bullet [Extract the most compelling achievements from the chosen story's results]
\\par \\li1080 \\bullet [Example format: "Reduced deployment time by 75% over 18 months as Engineering Manager"]
\\par \\li0

\\par \\li720 \\bullet \\b SELECTED LINE ITEM:\\b0
\\par \\li1080 \\bullet [Quote the exact bullet point/line item from the CV that was chosen]
\\par \\li0

\\par \\li720 \\bullet \\b STAR METHOD BREAKDOWN:\\b0
\\par \\li1080 \\bullet \\b Situation:\\b0
\\par \\li1440 \\bullet [Inferred context and background circumstances]
\\par \\li1800 \\bullet [Environmental factors that influenced the situation]
\\par \\li2160 \\bullet [Organizational context or constraints]
\\par \\li2520 \\bullet [Specific stakeholders or team dynamics involved]
\\par \\li1440 \\bullet [Additional situational details if relevant]
\\par \\li1080 \\bullet \\b Task:\\b0
\\par \\li1440 \\bullet [Specific responsibility or challenge that needed to be addressed]
\\par \\li1800 \\bullet [Primary objectives that needed to be achieved]
\\par \\li2160 \\bullet [Success criteria or metrics for evaluation]
\\par \\li2520 \\bullet [Timeline constraints or deadlines involved]
\\par \\li1440 \\bullet [Key objectives or goals that needed to be achieved]
\\par \\li1080 \\bullet \\b Actions:\\b0
\\par \\li1440 \\bullet [Detailed actions taken, decisions made, and approach used]
\\par \\li1800 \\bullet [Phase 1: Initial analysis and planning steps]
\\par \\li2160 \\bullet [Research conducted or data gathered]
\\par \\li2520 \\bullet [Stakeholder meetings or alignment activities]
\\par \\li1800 \\bullet [Phase 2: Implementation and execution steps]
\\par \\li2160 \\bullet [Technical decisions or architecture choices]
\\par \\li2520 \\bullet [Team coordination or resource allocation]
\\par \\li1800 \\bullet [Phase 3: Monitoring and optimization activities]
\\par \\li2160 \\bullet [Quality assurance or testing procedures]
\\par \\li2520 \\bullet [Feedback loops or iteration cycles implemented]
\\par \\li1440 \\bullet [Include any leadership, collaboration, or technical decisions]
\\par \\li1080 \\bullet \\b Results:\\b0
\\par \\li1440 \\bullet [Complete recap of quantified outcomes, impact, and follow-up effects]
\\par \\li1800 \\bullet [Immediate measurable results and metrics]
\\par \\li2160 \\bullet [Performance improvements or efficiency gains]
\\par \\li2520 \\bullet [Cost savings or revenue impact if applicable]
\\par \\li1800 \\bullet [Long-term impact and sustained improvements]
\\par \\li2160 \\bullet [Team or organizational benefits realized]
\\par \\li2520 \\bullet [Scalability or replicability of the solution]
\\par \\li1440 \\bullet [Recognition, feedback, or follow-up opportunities created]
\\par \\li0

\\par \\li720 \\bullet \\b COMPANY VALUES ADDRESSED:\\b0
\\par \\li1080 \\bullet [Company Value 1: Name and explanation]
\\par \\li1440 \\bullet [Specific example of how the story shows this value]
\\par \\li1800 \\bullet [Behavioral demonstration of the value]
\\par \\li2160 \\bullet [Decision-making alignment with this value]
\\par \\li2520 \\bullet [Outcomes that reinforce this value]
\\par \\li1440 \\bullet [Connection between actions taken and value demonstrated]
\\par \\li1080 \\bullet [Company Value 2: Name and explanation]
\\par \\li1440 \\bullet [Specific example of how the story shows this value]
\\par \\li1800 \\bullet [Leadership or collaboration example]
\\par \\li2160 \\bullet [Problem-solving approach alignment]
\\par \\li1080 \\bullet [Continue for each relevant company value]
\\par \\li0

\\par \\li720 \\bullet \\b RELEVANCE TO THIS ROLE:\\b0
\\par \\li1080 \\bullet [Explicitly connect how this story demonstrates fit for this specific job/company]
\\par \\li1440 \\bullet [Tie the results and approach back to what the role requires]
\\par \\li1800 \\bullet [Technical skills demonstrated that match job requirements]
\\par \\li2160 \\bullet [Leadership capabilities shown that align with role expectations]
\\par \\li2520 \\bullet [Scale or complexity handled that matches company needs]
\\par \\li1440 \\bullet [Show alignment with company needs and expectations]
\\par \\li1800 \\bullet [Cultural fit demonstrated through approach taken]
\\par \\li2160 \\bullet [Values alignment shown through decision-making]
\\par \\li1440 \\bullet [Highlight transferable skills and experiences]
\\par \\li1800 \\bullet [Direct skill transfer to new role responsibilities]
\\par \\li2160 \\bullet [Adaptability and learning demonstrated]
\\par \\li0

\\par \\li720 \\bullet \\b ALTERNATIVE LINE ITEMS CONSIDERED:\\b0
\\par \\li1080 \\bullet \\b "[Quote exact line item #1]"\\b0
\\par \\li1440 \\bullet [Brief explanation of why it was considered but not chosen]
\\par \\li1800 \\bullet [Strengths this story would have demonstrated]
\\par \\li2160 \\bullet [Company values it could have addressed]
\\par \\li1800 \\bullet [Limitations compared to the selected story]
\\par \\li2160 \\bullet [Why the selected story was ultimately better]
\\par \\li1080 \\bullet \\b "[Quote exact line item #2]"\\b0
\\par \\li1440 \\bullet [Brief explanation of why it was considered but not chosen]
\\par \\li1800 \\bullet [Potential value it could have provided]
\\par \\li2160 \\bullet [Specific skills or experiences it would have highlighted]
\\par \\li1800 \\bullet [Gap analysis compared to job requirements]
\\par \\li1080 \\bullet \\b "[Quote exact line item #3]"\\b0
\\par \\li1440 \\bullet [Brief explanation of why it was considered but not chosen]
\\par \\li1800 \\bullet [What made it a strong candidate initially]
\\par \\li2160 \\bullet [Specific achievements or metrics involved]
\\par \\li1800 \\bullet [Reasoning for final selection decision]
\\par \\li0
}

Focus on line items that contain quantified achievements, leadership moments, technical innovations, or business impact that can be expanded into compelling interview stories.

IMPORTANT: Structure the story to lead with impact (key results), tell the complete STAR narrative, and explicitly connect back to this specific role's requirements and company needs. The story should feel immediately relevant and compelling to the hiring manager for this position.`;

    const response = await this.makeClaudeRequest(prompt);
    
    // Log the response
    this.logFocusStoryGeneration(jobId, response);
    
    return response.trim();
  }

  private loadCachedFocusStory(jobId: string, cvFilePath: string): string | null {
    try {
      const prepDir = this.getJobPrepDir(jobId);

      const files = fs.readdirSync(prepDir);
      const focusFiles = files
        .filter(file => file.startsWith('focus-story-') && file.endsWith('.json'))
        .sort()
        .reverse(); // Most recent first

      if (focusFiles.length === 0) {
        return null;
      }

      const focusFile = focusFiles[0];
      const focusPath = path.join(prepDir, focusFile);
      const focusData = JSON.parse(fs.readFileSync(focusPath, 'utf-8'));

      // Validate the cache is still valid (CV hasn't changed)
      const cvStats = fs.statSync(cvFilePath);
      if (focusData.cvTimestamp !== cvStats.mtime.toISOString()) {
        console.log('📋 CV has changed since focus story was cached, will regenerate');
        return null;
      }

      return focusData.content;
    } catch (error) {
      return null;
    }
  }

  private cacheFocusStory(jobId: string, content: string, cvFilePath: string): void {
    try {
      const prepDir = this.getJobPrepDir(jobId);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const cvStats = fs.statSync(cvFilePath);

      const focusData = {
        timestamp: new Date().toISOString(),
        jobId,
        content,
        characterCount: content.length,
        cvFilePath: path.basename(cvFilePath),
        cvTimestamp: cvStats.mtime.toISOString()
      };

      const focusPath = path.join(prepDir, `focus-story-${timestamp}.json`);
      fs.writeFileSync(focusPath, JSON.stringify(focusData, null, 2));
      console.log(`📝 Focus story cached to: ${focusPath}`);
    } catch (error) {
      console.warn(`⚠️  Failed to cache focus story: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private logFocusStoryGeneration(jobId: string, response: string): void {
    try {
      const prepDir = this.getJobPrepDir(jobId);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logContent = [
        '🎯 Focus Story Generation Response',
        '=' .repeat(80),
        '',
        response,
        '',
        '=' .repeat(80),
        `Generated at: ${new Date().toISOString()}`
      ].join('\n');

      const logPath = path.join(prepDir, `focus-story-log-${timestamp}.txt`);
      fs.writeFileSync(logPath, logContent, 'utf-8');
      console.log(`📄 Focus story response logged to: ${logPath}`);
    } catch (error) {
      console.warn(`⚠️  Failed to log focus story response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private logPromptToFile(prompt: string, type: StatementType): void {
    try {
      if (!this.currentJobId) {
        // No job ID available, skip logging
        return;
      }

      const prepDir = this.getJobPrepDir(this.currentJobId);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const promptLogFile = path.join(prepDir, `prompt-${type}-${timestamp}.md`);

      const logContent = [
        `# ${type.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())} Prompt`,
        `Generated at: ${new Date().toISOString()}`,
        '',
        '## Prompt',
        '',
        prompt,
      ].join('\n');
      
      fs.writeFileSync(promptLogFile, logContent, 'utf-8');
      console.log(`📄 Prompt logged to: ${promptLogFile}`);
    } catch (error) {
      console.warn(`⚠️  Failed to log prompt: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

}

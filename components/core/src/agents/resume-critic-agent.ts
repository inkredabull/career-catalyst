import { JobListing, ResumeCritique, ResumeResult } from '../types';
import { resolveFromProjectRoot } from '../utils/project-root';
import { getResumeOutputDir } from '../config';
import * as fs from 'fs';
import * as path from 'path';
import { BaseLLMProvider } from '../providers/llm-provider';
import { confirmCostEstimate } from '../utils/cost-confirmation';

export class ResumeCriticAgent {
  private provider: BaseLLMProvider;

  constructor(provider: BaseLLMProvider) {
    this.provider = provider;
  }

  private getJobResumeDir(jobId: string): string {
    const dir = resolveFromProjectRoot('logs', jobId, 'resume');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private getJobPrepDir(jobId: string): string {
    return resolveFromProjectRoot('logs', jobId, 'prep');
  }

  async critiqueResume(jobId: string): Promise<ResumeCritique> {
    try {
      // Find the most recent resume for this job ID
      const resumePath = this.findMostRecentResume(jobId);
      if (!resumePath) {
        return {
          success: false,
          jobId,
          resumePath: '',
          overallRating: 0,
          strengths: [],
          weaknesses: [],
          recommendations: [],
          detailedAnalysis: '',
          timestamp: new Date().toISOString(),
          error: `No resume found for job ID: ${jobId}`
        };
      }

      // Load the job data for context
      const jobData = this.loadJobData(jobId);

      // Load additional context documents
      const themes = this.loadThemes(jobId);
      const recommendations = this.loadRecommendations(jobId);
      const companyValues = this.loadCompanyValues(jobId);
      const domainContext = this.detectDomain(jobData.description);

      // Extract text content from the PDF
      const resumeContent = await this.extractResumeContent(resumePath);

      // Generate the critique using Claude
      const critique = await this.generateCritique(
        jobData,
        resumeContent,
        resumePath,
        jobId,
        themes,
        recommendations,
        companyValues,
        domainContext
      );

      // Log the critique
      this.logCritique(critique);

      return critique;
    } catch (error) {
      return {
        success: false,
        jobId,
        resumePath: '',
        overallRating: 0,
        strengths: [],
        weaknesses: [],
        recommendations: [],
        detailedAnalysis: '',
        timestamp: new Date().toISOString(),
        error: `Failed to critique resume for job ${jobId}: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private findMostRecentResume(jobId: string): string | null {
    const allResumeFiles: Array<{name: string, path: string, mtime: Date}> = [];

    // Load job data to get company and role info for matching
    let jobData: JobListing | null = null;
    try {
      jobData = this.loadJobData(jobId);
    } catch (error) {
      console.warn(`Could not load job data for ${jobId}:`, error);
    }

    // Search in resume subfolder
    const resumeDir = this.getJobResumeDir(jobId);
    if (fs.existsSync(resumeDir)) {
      const files = fs.readdirSync(resumeDir);
      const logResumeFiles = files
        .filter(file => {
          return file.endsWith('.pdf') && (
            file.startsWith('resume-') || // Old timestamp-based format
            (!file.startsWith('job-') && !file.startsWith('score-') && !file.startsWith('critique-') && !file.startsWith('tailored-') && !file.startsWith('prompt-')) // New meaningful format (exclude other log files)
          );
        })
        .map(file => {
          const fullPath = path.join(resumeDir, file);
          const stats = fs.statSync(fullPath);
          return {
            name: file,
            path: fullPath,
            mtime: stats.mtime
          };
        });
      allResumeFiles.push(...logResumeFiles);
    }

    // Search in RESUME_OUTPUT_DIR (current location)
    const resumeOutputDir = getResumeOutputDir();
    if (fs.existsSync(resumeOutputDir)) {
      const files = fs.readdirSync(resumeOutputDir);
      const outputResumeFiles = files
        .filter(file => {
          if (!file.endsWith('.pdf')) return false;
          
          // First try to match by job ID (if filename contains it)
          if (file.includes(jobId)) return true;
          
          // If we have job data, try to match by company and role
          if (jobData) {
            const lowerFileName = file.toLowerCase();
            const lowerCompany = jobData.company.toLowerCase();
            const lowerTitle = jobData.title.toLowerCase();
            
            // Check if filename contains both company and role
            return lowerFileName.includes(lowerCompany) && 
                   (lowerFileName.includes(lowerTitle) || 
                    lowerTitle.split(' ').some(word => word.length > 3 && lowerFileName.includes(word)));
          }
          
          return false;
        })
        .map(file => {
          const fullPath = path.join(resumeOutputDir, file);
          const stats = fs.statSync(fullPath);
          return {
            name: file,
            path: fullPath,
            mtime: stats.mtime
          };
        });
      allResumeFiles.push(...outputResumeFiles);
    }

    // Sort all found files by modification time, most recent first
    allResumeFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    return allResumeFiles.length > 0 ? allResumeFiles[0].path : null;
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

  private loadThemes(jobId: string): string | null {
    try {
      const prepDir = this.getJobPrepDir(jobId);
      const legacyDir = resolveFromProjectRoot('logs', jobId);
      const searchDir = fs.existsSync(prepDir) ? prepDir : legacyDir;
      if (!fs.existsSync(searchDir)) return null;

      const files = fs.readdirSync(searchDir);
      const themesFile = files.find(file => file.startsWith('themes-') && file.endsWith('.json'));

      if (!themesFile) {
        return null;
      }

      const themesPath = path.join(searchDir, themesFile);
      const themesData = JSON.parse(fs.readFileSync(themesPath, 'utf-8'));

      if (themesData.themes && Array.isArray(themesData.themes)) {
        // Format themes for the critique prompt
        const formattedThemes = themesData.themes
          .map((theme: any, index: number) =>
            `${index + 1}. **${theme.name}** (${theme.importance.toUpperCase()})\n   ${theme.definition}\n   *Evidence to look for:* ${theme.cvEvidence || 'Relevant experience in CV'}`
          )
          .join('\n\n');

        return formattedThemes;
      }
    } catch (error) {
      console.warn(`⚠️  Failed to load themes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return null;
  }

  private loadRecommendations(jobId: string): string | null {
    try {
      const resumeDir = this.getJobResumeDir(jobId);
      const recommendationsPath = path.join(resumeDir, 'recommendations.txt');

      if (!fs.existsSync(recommendationsPath)) {
        return null;
      }

      const recommendations = fs.readFileSync(recommendationsPath, 'utf-8');
      return recommendations.trim();
    } catch (error) {
      console.warn(`⚠️  Failed to load recommendations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return null;
  }

  private loadCompanyValues(jobId: string): string | null {
    try {
      const prepDir = this.getJobPrepDir(jobId);
      const legacyDir = resolveFromProjectRoot('logs', jobId);
      for (const dir of [prepDir, legacyDir]) {
        const f = path.join(dir, 'company-values.txt');
        if (fs.existsSync(f)) {
          const content = fs.readFileSync(f, 'utf-8').trim();
          if (content.length > 0) return content;
        }
      }
    } catch (error) {
      console.warn(`⚠️  Failed to load company values: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return null;
  }

  private detectDomain(jobDescription: string): {
    domain: string;
    signals: string[];
    expectedVocabulary: string[];
    toneExpectations: string[];
  } {
    const description = jobDescription.toLowerCase();

    // Platform Engineering / Infrastructure Leadership detection
    // Check this FIRST as it's most specific
    const platformSignals = [
      'platform engineering', 'infrastructure', 'developer experience',
      'internal tools', 'developer platform', 'api platform',
      'distributed systems', 'service-oriented architecture',
      'site reliability', 'sre', 'devops platform',
      'capacity planning', 'operational excellence', 'backend platform'
    ];
    const foundPlatformSignals = platformSignals.filter(signal => description.includes(signal));

    if (foundPlatformSignals.length >= 2) {
      return {
        domain: 'Platform Engineering / Infrastructure Leadership',
        signals: foundPlatformSignals,
        expectedVocabulary: [
          'architected platform to scale (strategic systems thinking)',
          'led organizational transformation (org design is part of the role)',
          'established operational excellence standards (setting standards)',
          'built developer platform enabling (internal tooling as product)',
          'restructured teams for reliability (team design matters)',
          'defined technical strategy and roadmap (VP-level planning)',
          'partnered cross-functionally with Product/Security/Data',
          'scaled infrastructure to support millions of users',
          'implemented SLO/SLA frameworks and on-call practices',
          'reduced incident frequency through architectural improvements'
        ],
        toneExpectations: [
          'Strategic technical leader and architect (VP-level appropriate)',
          'Systems thinking and long-term platform vision',
          'Team/organization builder and mentor of senior engineers',
          'Cross-functional influence and executive partnership',
          'Operational excellence and reliability as core focus',
          'Scale, performance, availability metrics emphasized',
          'Internal transformation IS valuable (opposite of Forward Deployed)',
          'Developer experience and productivity as outcomes'
        ]
      };
    }

    // Forward Deployed / Customer-Facing detection
    const forwardDeployedSignals = ['forward deployed', 'customer-facing', 'embedded with customers', 'on-site', 'field engineering', 'solutions engineer', 'customer integration', 'client-facing'];
    const foundFDSignals = forwardDeployedSignals.filter(signal => description.includes(signal));

    if (foundFDSignals.length > 0) {
      return {
        domain: 'Forward Deployed / Customer-Facing',
        signals: foundFDSignals,
        expectedVocabulary: [
          'customer-embedded deployment (not "internal transformation")',
          'partnered directly with enterprise customers to deploy',
          'embedded on-site with customer teams',
          'represented company technically in executive stakeholder meetings',
          'integrated systems into client operational environments',
          'custom enterprise integrations (not "platform features")',
          'navigated ambiguity in messy real-world constraints'
        ],
        toneExpectations: [
          'Ground-level execution (not VP-level architecture)',
          'Customer proximity and direct partnership',
          'Fast integration cycles in ambiguous environments',
          'Comfortable operating with incomplete requirements',
          'Technical ownership in real-world production constraints',
          'Client relationship management alongside technical delivery'
        ]
      };
    }

    // Healthcare / Regulated detection
    const healthcareSignals = ['hipaa', 'soc2', 'compliance', 'clinical', 'patient data', 'pii', 'regulated', 'audit', 'phi', 'fhir', 'ehr', 'healthcare'];
    const foundHealthcareSignals = healthcareSignals.filter(signal => description.includes(signal));

    if (foundHealthcareSignals.length > 0) {
      return {
        domain: 'Healthcare / Regulated',
        signals: foundHealthcareSignals,
        expectedVocabulary: [
          'clinical/operational reliability (not "incident reduction")',
          'enterprise readiness (not "auth implementation")',
          'augmenting clinician/practitioner workflows (not "AI features")',
          'predictable delivery in regulated contexts (not "fast iteration")',
          'partnered with Product/Design (not "I built")',
          'architected for enterprise security (not "scaled infrastructure")',
          'operational rigor for mission-critical usage (not "reduced bugs")'
        ],
        toneExpectations: [
          'Product-minded operator building durable systems',
          'Reliability, durability, trust over speed',
          'User empathy for clinicians, operators, support teams',
          'Product partnership language',
          'Quality and correctness over velocity'
        ]
      };
    }

    // Fintech detection
    const fintechSignals = ['fintech', 'financial', 'payments', 'banking', 'pci', 'financial data', 'transactions'];
    const foundFintechSignals = fintechSignals.filter(signal => description.includes(signal));

    if (foundFintechSignals.length > 0) {
      return {
        domain: 'Fintech / Regulated',
        signals: foundFintechSignals,
        expectedVocabulary: [
          'enterprise readiness',
          'compliance framework',
          'predictable delivery in regulated contexts',
          'architected for enterprise security',
          'operational rigor'
        ],
        toneExpectations: [
          'Product-minded operator',
          'Reliability and trust over speed',
          'Compliance-first mindset'
        ]
      };
    }

    // Enterprise / Scale Stage detection
    const enterpriseSignals = ['enterprise customers', 'scale', 'maturity', 'predictability', 'b2b', 'saas'];
    const foundEnterpriseSignals = enterpriseSignals.filter(signal => description.includes(signal));

    if (foundEnterpriseSignals.length > 0) {
      return {
        domain: 'Enterprise / Scale Stage',
        signals: foundEnterpriseSignals,
        expectedVocabulary: [
          'product-minded operator',
          'building durable systems',
          'predictability',
          'operational rigor'
        ],
        toneExpectations: [
          'From "0→1 founder" to "product-minded operator"',
          'Predictability, partnership, operational rigor',
          'Cross-functional collaboration'
        ]
      };
    }

    // Startup / Builder detection
    const startupSignals = ['startup', 'early stage', '0 to 1', 'founder', 'scrappy', 'move fast'];
    const foundStartupSignals = startupSignals.filter(signal => description.includes(signal));

    if (foundStartupSignals.length > 0) {
      return {
        domain: 'Startup / Early Stage',
        signals: foundStartupSignals,
        expectedVocabulary: [
          'hands-on builder',
          'shipped quickly',
          'end-to-end ownership',
          'prototype to production'
        ],
        toneExpectations: [
          'Hands-on execution',
          'Speed and iteration',
          'Scrappy problem-solving'
        ]
      };
    }

    return {
      domain: 'General',
      signals: [],
      expectedVocabulary: [],
      toneExpectations: []
    };
  }

  private async extractResumeContent(resumePath: string): Promise<string> {
    try {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ url: resumePath });
      const result = await parser.getText();
      return result.text;
    } catch (error) {
      console.warn(`⚠️  Failed to extract PDF text: ${error instanceof Error ? error.message : 'Unknown error'}`);
      const filename = path.basename(resumePath);
      return `[Resume content from ${filename} - PDF text extraction failed]`;
    }
  }

  /**
   * Critique resume content directly (markdown text) without needing a PDF on disk.
   * Designed for the parallel orchestrator — cost is confirmed upfront, so per-critique
   * confirmation is skipped.
   */
  async critiqueContent(
    resumeText: string,
    job: JobListing,
    jobId: string
  ): Promise<ResumeCritique> {
    try {
      const themes = this.loadThemes(jobId);
      const companyValues = this.loadCompanyValues(jobId);
      const domainContext = this.detectDomain(job.description);
      const critique = await this.generateCritique(
        job, resumeText, '', jobId, themes, null, companyValues, domainContext,
        true /* skipConfirmation */
      );
      this.logCritique(critique);
      return critique;
    } catch (error) {
      return {
        success: false, jobId, resumePath: '',
        overallRating: 0, strengths: [], weaknesses: [], recommendations: [],
        detailedAnalysis: '',
        timestamp: new Date().toISOString(),
        error: `Critique failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async generateCritique(
    job: JobListing,
    resumeContent: string,
    resumePath: string,
    jobId: string,
    themes: string | null,
    recommendations: string | null,
    companyValues: string | null,
    domainContext: { domain: string; signals: string[]; expectedVocabulary: string[]; toneExpectations: string[] },
    skipConfirmation = false
  ): Promise<ResumeCritique> {
    // Build the "More Context" section
    let moreContextSection = '';

    if (themes) {
      moreContextSection += `\n## PRIORITY THEMES (Critical Requirements to Address)\n${themes}\n`;
    }

    if (companyValues) {
      moreContextSection += `\n## COMPANY VALUES (Must Demonstrate Alignment)\n${companyValues}\n`;
    }

    if (recommendations) {
      moreContextSection += `\n## PREVIOUS RECOMMENDATIONS (From Earlier Critiques)\n${recommendations}\n`;
    }

    // Build domain-specific guidance
    let domainGuidanceSection = '';
    if (domainContext.signals.length > 0) {
      domainGuidanceSection = `
## DOMAIN ADAPTATION SIGNALS

**Detected Industry:** ${domainContext.domain}
**Job Description Keywords Found:** ${domainContext.signals.join(', ')}

**CRITICAL - Expected Vocabulary Transformations:**
${domainContext.expectedVocabulary.map(v => `- ${v}`).join('\n')}

**CRITICAL - Tone Expectations:**
${domainContext.toneExpectations.map(t => `- ${t}`).join('\n')}

**Evaluate the resume specifically for:**
1. Does it use domain-appropriate vocabulary? (e.g., "clinical reliability" not "incident reduction" for healthcare)
2. Does the tone match the domain? (e.g., "product-minded operator" not "0→1 cowboy CTO" for regulated environments)
3. Are compliance/reliability experiences surfaced appropriately for regulated domains?
4. Does it emphasize partnership language ("with Product/Design") vs solo builder language ("I built") where appropriate?
`;
    }

    // Build AI technical depth checking section
    const aiKeywords = ['ai', 'llm', 'genai', 'generative ai', 'machine learning', 'agent', 'agents', 'gpt', 'claude', 'openai'];
    const isAIRole = aiKeywords.some(keyword => job.title.toLowerCase().includes(keyword) || job.description.toLowerCase().includes(keyword));

    let aiDepthSection = '';
    if (isAIRole) {
      aiDepthSection = `
## AI/LLM TECHNICAL DEPTH CHECK

**CRITICAL:** This is an AI/LLM role. The resume MUST demonstrate technical depth, not abstract buzzwords.

**Required Technical Specifics (check if present):**
- **RAG architectures:** retrieval-augmented generation, chunking, embeddings, vector databases
- **Multi-agent orchestration:** agent frameworks (LangChain, LlamaIndex), workflow design
- **Evaluation frameworks:** how LLM outputs are tested, validated, benchmarked
- **Guardrails & safety:** content filtering, hallucination detection, safety systems
- **Cost optimization:** token cost controls, caching strategies, prompt compression, model selection
- **LLM observability:** tracing, monitoring, debugging (LangSmith, W&B, Phoenix, custom)
- **Latency optimization:** streaming, batching, caching, model selection
- **Prompt engineering:** prompt catalogs, versioning, A/B testing, optimization
- **Human-in-the-loop:** review systems, feedback loops, escalation workflows

**Evaluation:**
- ❌ ABSTRACT/WEAK: "Scaled AI agent systems", "Implemented GenAI features", "Deployed LLMs"
- ✅ SPECIFIC/STRONG: "Implemented RAG-backed support agent with semantic caching, reducing token costs 60%"
- ✅ SPECIFIC/STRONG: "Built multi-agent orchestration with LangChain and human-in-the-loop review for compliance"
- ✅ SPECIFIC/STRONG: "Deployed evaluation pipeline with hallucination detection using LLM-as-judge + heuristic guardrails"

**Flag as critical weakness if:** AI work is mentioned but lacks technical specifics. The resume should sound technical, not conceptual.
`;
    }

    const prompt = `You are an expert resume critic and career coach. Analyze the following resume that was tailored for a specific job posting and provide detailed, actionable feedback.

# JOB POSTING

**Title:** ${job.title}
**Company:** ${job.company}
**Location:** ${job.location}

**Description:**
${job.description}

${job.salary ? `**Salary:** ${job.salary.min} - ${job.salary.max} ${job.salary.currency}` : ''}

# RESUME CONTENT

${resumeContent}

${moreContextSection}

${domainGuidanceSection}

${aiDepthSection}

# EVALUATION CRITERIA

Your critique must evaluate these dimensions:

1. **Job Alignment (40%)**: How well does the resume align with the specific job requirements and priority themes?
   - Are the priority themes from the job analysis clearly addressed?
   - Are domain-specific keywords present (e.g., HIPAA, SOC2, FHIR for healthcare)?
   - Does the resume speak directly to the role's core challenges?

2. **Domain Vocabulary & Tone (25%)**: Does the resume use appropriate vocabulary and tone for the industry?
   - For regulated/healthcare: Does it emphasize reliability, compliance, partnership over speed and solo building?
   - For enterprise: Does it sound like "product-minded operator" not "0→1 founder"?
   - Are the vocabulary transformations applied correctly?

3. **Content Quality (20%)**: Are achievements quantified and compelling?
   - Are metrics specific and impactful?
   - Are accomplishments framed in terms of business/user impact?

4. **Company Values Alignment (15%)**: Does the resume demonstrate alignment with company values?
   - Are examples chosen that reflect the company's stated values?
   - Is the cultural fit evident?

# TASK

Provide a detailed critique with:

**Strengths:** Identify 3-5 specific things the resume does well
**Weaknesses:** Identify 3-5 specific gaps, misalignments, or issues
**Recommendations:** Provide 5-10 ACTIONABLE, SPECIFIC recommendations

Make recommendations CONCRETE and TACTICAL:
- ❌ BAD: "Improve healthcare experience"
- ✅ GOOD: "Add FHIR integration work from Axiom project to Summary. Currently missing despite being a critical requirement."
- ❌ BAD: "Use better vocabulary"
- ✅ GOOD: "Replace 'incident reduction' with 'clinical reliability' in Osmind bullet to match healthcare domain expectations"
- ❌ BAD: "Show more partnership"
- ✅ GOOD: "Reframe Summary from 'Built AI systems' to 'Partnered with Product/Design to deliver AI-powered clinical workflows' to avoid sounding too senior/solo"

**CRITICAL:** If priority themes are present, explicitly call out which themes are well-addressed and which are missing or weak.

# OUTPUT FORMAT

CRITICAL: You must respond with ONLY valid JSON. No other text, explanations, or formatting. Your response must be parseable JSON that exactly matches this schema:

{
  "overallRating": <number between 1-10>,
  "strengths": [
    "<specific strength with evidence from resume>",
    "<specific strength with evidence from resume>",
    ...
  ],
  "weaknesses": [
    "<specific weakness with concrete example>",
    "<specific weakness with concrete example>",
    ...
  ],
  "recommendations": [
    "<actionable, tactical recommendation with specific location/change>",
    "<actionable, tactical recommendation with specific location/change>",
    ...
  ],
  "detailedAnalysis": "<2-3 paragraph detailed analysis covering: (1) alignment with priority themes and job requirements, (2) domain vocabulary and tone appropriateness, (3) company values demonstration, (4) content quality and presentation, (5) specific missing elements or opportunities>"
}

REMEMBER: Response must be valid JSON only. No markdown, no code blocks, no additional text.`;

    console.log('⏳ Generating critique...');
    console.log(`📦 Provider: ${this.provider.getProviderName()}`);
    console.log(`🤖 Model: ${this.provider.getModelName()}`);

    const request = { prompt };

    if (!skipConfirmation) {
      const confirmed = await confirmCostEstimate(this.provider, request, 'Resume Critique');
      if (!confirmed) throw new Error('Critique cancelled by user');
    }

    // Start timing after confirmation
    const startTime = Date.now();

    // Make request via provider
    const response = await this.provider.makeRequest(request);

    // Calculate elapsed time
    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`📊 Token usage: ${response.usage.inputTokens.toLocaleString()} input, ${response.usage.outputTokens.toLocaleString()} output`);
    console.log(`💰 Cost: $${response.cost.totalCost.toFixed(4)}`);
    console.log(`⏱️  Critique time: ${elapsedSeconds}s`);

    try {
      // Clean the response to extract JSON if Claude adds extra text
      let cleanedResponse = response.text.trim();
      
      // Look for JSON object boundaries
      const jsonStart = cleanedResponse.indexOf('{');
      const jsonEnd = cleanedResponse.lastIndexOf('}');
      
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleanedResponse = cleanedResponse.substring(jsonStart, jsonEnd + 1);
      }
      
      const critiqueData = JSON.parse(cleanedResponse);
      
      // Validate required fields
      if (typeof critiqueData.overallRating !== 'number' ||
          !Array.isArray(critiqueData.strengths) ||
          !Array.isArray(critiqueData.weaknesses) ||
          !Array.isArray(critiqueData.recommendations) ||
          typeof critiqueData.detailedAnalysis !== 'string') {
        throw new Error('Response missing required fields or has incorrect types');
      }
      
      return {
        success: true,
        jobId: jobId, // Use the jobId parameter instead of extracting from path
        resumePath,
        overallRating: Math.max(1, Math.min(10, critiqueData.overallRating)), // Ensure 1-10 range
        strengths: critiqueData.strengths.filter((s: any) => typeof s === 'string' && s.trim()),
        weaknesses: critiqueData.weaknesses.filter((w: any) => typeof w === 'string' && w.trim()),
        recommendations: critiqueData.recommendations.filter((r: any) => typeof r === 'string' && r.trim()),
        detailedAnalysis: critiqueData.detailedAnalysis,
        timestamp: new Date().toISOString(),
        cost: response.cost.totalCost
      };
    } catch (error) {
      throw new Error(`Failed to parse critique response: ${error instanceof Error ? error.message : 'Invalid JSON'}`);
    }
  }

  private extractJobIdFromPath(resumePath: string): string {
    const filename = path.basename(resumePath);
    const match = filename.match(/resume-([a-f0-9]+)-/);
    return match ? match[1] : 'unknown';
  }

  private logCritique(critique: ResumeCritique): void {
    const logEntry = {
      timestamp: critique.timestamp,
      jobId: critique.jobId,
      resumePath: critique.resumePath,
      overallRating: critique.overallRating,
      strengths: critique.strengths,
      weaknesses: critique.weaknesses,
      recommendations: critique.recommendations,
      detailedAnalysis: critique.detailedAnalysis
    };

    // Write critique artifacts to the resume subfolder
    const resumeDir = this.getJobResumeDir(critique.jobId);

    // Log the full critique as JSON
    const logPath = path.join(resumeDir, `critique-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(logPath, JSON.stringify(logEntry, null, 2));
    console.log(`✅ Resume critique logged to: ${logPath}`);

    // Also append recommendations to recommendations.txt file
    if (critique.recommendations && critique.recommendations.length > 0) {
      const recommendationsFile = path.join(resumeDir, 'recommendations.txt');
      const timestamp = new Date().toISOString();
      
      // Create header with timestamp for this critique session
      const recommendationHeader = `\n# Recommendations from critique on ${timestamp}\n`;
      const recommendationEntries = critique.recommendations.map(rec => rec.trim()).join('\n') + '\n';
      
      try {
        // Append to file (or create if it doesn't exist)
        fs.appendFileSync(recommendationsFile, recommendationHeader + recommendationEntries);
        console.log(`📝 ${critique.recommendations.length} recommendations appended to: ${recommendationsFile}`);
      } catch (error) {
        console.warn(`⚠️  Failed to write recommendations: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }
}
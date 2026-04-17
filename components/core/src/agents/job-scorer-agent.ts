import { BaseAgent } from './base-agent';
import { ResumeCreatorAgent } from './resume-creator-agent';
import { JobListing, JobCriteria, JobScore, AgentConfig } from '../types';
import { resolveFromProjectRoot } from '../utils/project-root';
import { getAnthropicConfig, getAutoResumeConfig, getResumeGenerationConfig } from '../config';
import { generateScoringReportHTML } from '../utils/report-generator';
import { LLMProviderConfig } from '../providers/llm-provider';
import * as fs from 'fs';
import * as path from 'path';

export class JobScorerAgent extends BaseAgent {
  private criteria: JobCriteria;
  private autoResumeConfig: { threshold: number; cvPath: string | null };

  constructor(config: AgentConfig, criteriaPath?: string) {
    super(config);
    this.criteria = this.loadCriteria(criteriaPath || 'criteria.json');
    this.autoResumeConfig = getAutoResumeConfig();
  }

  async extract(): Promise<never> {
    throw new Error('JobScorerAgent does not implement extract method. Use scoreJob instead.');
  }

  async scoreJob(jobId: string): Promise<JobScore> {
    try {
      const jobData = await this.loadJobData(jobId);
      const score = await this.calculateScore(jobData);

      const jobScore: JobScore = {
        jobId,
        overallScore: Math.round(score.overall * 100),
        rationale: await this.generateRationale(jobData, score),
        breakdown: {
          required_skills: Math.round(score.breakdown.required_skills * 100),
          preferred_skills: Math.round(score.breakdown.preferred_skills * 100),
          experience_level: Math.round(score.breakdown.experience_level * 100),
          salary: Math.round(score.breakdown.salary * 100),
          location: Math.round(score.breakdown.location * 100),
          company_match: Math.round(score.breakdown.company_match * 100),
        },
        explanations: {
          required_skills: score.explanations.required_skills,
          preferred_skills: score.explanations.preferred_skills,
          experience_level: score.explanations.experience_level,
          salary: score.explanations.salary,
          location: score.explanations.location,
          company_match: score.explanations.company_match,
        },
        strategic_analysis: await this.generateStrategicAnalysis(jobData),
        timestamp: new Date().toISOString(),
      };

      await this.logScore(jobScore);
      
      // Automatically generate resume if score is above threshold and CV path is provided
      if (jobScore.overallScore >= this.autoResumeConfig.threshold && this.autoResumeConfig.cvPath) {
        await this.generateAutoResume(jobId, jobScore.overallScore);
      }
      
      return jobScore;
    } catch (error) {
      throw new Error(`Failed to score job ${jobId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private loadCriteria(criteriaPath: string): JobCriteria {
    const fullPath = path.resolve(criteriaPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Criteria file not found: ${fullPath}`);
    }
    
    const criteriaData = fs.readFileSync(fullPath, 'utf-8');
    return JSON.parse(criteriaData);
  }

  private async loadJobData(jobId: string): Promise<JobListing> {
    // 1. Local cache (fast path)
    const cacheFile = resolveFromProjectRoot('logs', jobId, 'job-cache.json');
    if (fs.existsSync(cacheFile)) {
      return JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    }

    // 2. Legacy job-*.json (backward compat)
    const jobDir = resolveFromProjectRoot('logs', jobId);
    if (fs.existsSync(jobDir)) {
      const files = fs.readdirSync(jobDir);
      const legacyFile = files.find(f => f.startsWith('job-') && f.endsWith('.json'));
      if (legacyFile) {
        const data = JSON.parse(fs.readFileSync(path.join(jobDir, legacyFile), 'utf-8'));
        // Lazy migration
        fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
        return data;
      }
    }

    // 3. Google Sheets fallback
    const sheetsUrl = process.env.GOOGLE_SHEETS_URL;
    const sheetName = process.env.GOOGLE_SHEETS_SHEET_NAME || 'Sheet1';
    if (sheetsUrl) {
      try {
        const { GoogleSheetsClient, extractSpreadsheetId, sheetsRowToJobListing } = await import('../utils/google-sheets');
        const client = new GoogleSheetsClient();
        const spreadsheetId = extractSpreadsheetId(sheetsUrl);
        const row = await client.fetchJobById(spreadsheetId, sheetName, jobId);
        if (row) {
          const jobData = sheetsRowToJobListing(row);
          fs.mkdirSync(jobDir, { recursive: true });
          fs.writeFileSync(cacheFile, JSON.stringify(jobData, null, 2));
          return jobData;
        }
      } catch (sheetsError) {
        console.warn(`⚠️  Sheets fallback failed: ${sheetsError instanceof Error ? sheetsError.message : 'Unknown'}`);
      }
    }

    throw new Error(`Job data not found for ID: ${jobId}`);
  }

  private async calculateScore(job: JobListing): Promise<{
    overall: number;
    breakdown: {
      required_skills: number;
      preferred_skills: number;
      experience_level: number;
      salary: number;
      location: number;
      company_match: number;
    };
    explanations: {
      required_skills: string;
      preferred_skills: string;
      experience_level: string;
      salary: string;
      location: string;
      company_match: string;
    };
  }> {
    const requiredSkillsResult = this.scoreRequiredSkills(job);
    const preferredSkillsResult = this.scorePreferredSkills(job);
    const experienceLevelResult = this.scoreExperienceLevel(job);
    const salaryResult = this.scoreSalary(job);
    const locationResult = this.scoreLocation(job);
    const companyMatchResult = this.scoreCompanyMatch(job);

    const breakdown = {
      required_skills: requiredSkillsResult.score,
      preferred_skills: preferredSkillsResult.score,
      experience_level: experienceLevelResult.score,
      salary: salaryResult.score,
      location: locationResult.score,
      company_match: companyMatchResult.score,
    };

    const explanations = {
      required_skills: requiredSkillsResult.explanation,
      preferred_skills: preferredSkillsResult.explanation,
      experience_level: experienceLevelResult.explanation,
      salary: salaryResult.explanation,
      location: locationResult.explanation,
      company_match: companyMatchResult.explanation,
    };

    const overall =
      breakdown.required_skills * this.criteria.weights.required_skills +
      breakdown.preferred_skills * this.criteria.weights.preferred_skills +
      breakdown.experience_level * this.criteria.weights.experience_level +
      breakdown.salary * this.criteria.weights.salary +
      breakdown.location * this.criteria.weights.location +
      breakdown.company_match * this.criteria.weights.company_match;

    return { overall, breakdown, explanations };
  }

  private scoreRequiredSkills(job: JobListing): { score: number; explanation: string } {
    const jobText = `${job.title} ${job.description}`.toLowerCase();
    const foundSkills = this.criteria.required_skills.filter(skill =>
      jobText.includes(skill.toLowerCase())
    );
    const score = foundSkills.length / this.criteria.required_skills.length;
    
    const explanation = foundSkills.length === this.criteria.required_skills.length
      ? `All ${this.criteria.required_skills.length} required skills found`
      : foundSkills.length === 0
      ? `None of the ${this.criteria.required_skills.length} required skills found`
      : `${foundSkills.length}/${this.criteria.required_skills.length} required skills found: ${foundSkills.join(', ')}`;
    
    return { score, explanation };
  }

  private scorePreferredSkills(job: JobListing): { score: number; explanation: string } {
    const jobText = `${job.title} ${job.description}`.toLowerCase();
    const foundSkills = this.criteria.preferred_skills.filter(skill =>
      jobText.includes(skill.toLowerCase())
    );
    const score = foundSkills.length / this.criteria.preferred_skills.length;
    
    const explanation = foundSkills.length === this.criteria.preferred_skills.length
      ? `All ${this.criteria.preferred_skills.length} preferred skills found`
      : foundSkills.length === 0
      ? `None of the ${this.criteria.preferred_skills.length} preferred skills found`
      : `${foundSkills.length}/${this.criteria.preferred_skills.length} preferred skills found: ${foundSkills.join(', ')}`;
    
    return { score, explanation };
  }

  private scoreExperienceLevel(job: JobListing): { score: number; explanation: string } {
    const jobText = `${job.title} ${job.description}`.toLowerCase();
    let bestMatch = 0;
    let bestExplanation = 'No experience level keywords found';
    
    for (const [level, years] of Object.entries(this.criteria.experience_levels)) {
      if (jobText.includes(level.toLowerCase())) {
        const yearPattern = new RegExp(`(\\d+)\\+?\\s*years?`, 'gi');
        const yearMatches = job.description.match(yearPattern);
        
        if (yearMatches) {
          const requiredYears = Math.max(...yearMatches.map(match => parseInt(match)));
          const score = Math.min(years / requiredYears, 1);
          if (score > bestMatch) {
            bestMatch = score;
            bestExplanation = `Found '${level}' level, requiring ${requiredYears} years (you have ${years})`;
          }
        } else {
          if (0.7 > bestMatch) {
            bestMatch = 0.7;
            bestExplanation = `Found '${level}' level but no specific years mentioned`;
          }
        }
      }
    }
    
    return { score: bestMatch, explanation: bestExplanation };
  }

  private scoreSalary(job: JobListing): { score: number; explanation: string } {
    if (!job.salary) return { score: 0.5, explanation: 'No salary information provided' };
    
    // Handle both string and number salary values
    const jobMin = typeof job.salary.min === 'number' ? job.salary.min : parseInt(job.salary.min?.replace(/[$,]/g, '') || '0');
    const jobMax = typeof job.salary.max === 'number' ? job.salary.max : parseInt(job.salary.max?.replace(/[$,]/g, '') || '0');
    const criteriaMin = this.criteria.salary_range.min;
    const criteriaMax = this.criteria.salary_range.max;
    
    if (jobMin === 0 && jobMax === 0) return { score: 0.5, explanation: 'Salary range not specified' };
    
    const salaryRange = jobMax > 0 ? `$${jobMin.toLocaleString()}-$${jobMax.toLocaleString()}` : `$${jobMin.toLocaleString()}`;
    const criteriaRange = `$${criteriaMin.toLocaleString()}-$${criteriaMax.toLocaleString()}`;
    
    // Use the effective job max (or min if no max specified)
    const effectiveJobMax = jobMax > 0 ? jobMax : jobMin;
    
    // Check for range overlap
    const hasOverlap = jobMin <= criteriaMax && effectiveJobMax >= criteriaMin;
    
    if (hasOverlap) {
      // Calculate overlap quality
      const overlapMin = Math.max(jobMin, criteriaMin);
      const overlapMax = Math.min(effectiveJobMax, criteriaMax);
      const overlapSize = overlapMax - overlapMin;
      const criteriaSize = criteriaMax - criteriaMin;
      const jobSize = effectiveJobMax - jobMin;
      
      // Score based on how much of the target range is covered
      const overlapRatio = overlapSize / Math.min(criteriaSize, jobSize);
      const score = Math.min(1, overlapRatio * 1.2); // Slight bonus for overlap
      
      if (jobMin >= criteriaMin && effectiveJobMax <= criteriaMax) {
        return { score: 1, explanation: `Salary ${salaryRange} fits entirely within target range ${criteriaRange}` };
      } else {
        return { score, explanation: `Salary ${salaryRange} overlaps with target range ${criteriaRange}` };
      }
    }
    
    // No overlap - determine if above or below
    if (effectiveJobMax < criteriaMin) {
      const score = Math.max(0, effectiveJobMax / criteriaMin * 0.8); // Penalty for being below
      return { score, explanation: `Salary ${salaryRange} below target range ${criteriaRange}` };
    } else {
      // Job min is above criteria max
      const score = Math.max(0, 1 - (jobMin - criteriaMax) / criteriaMax * 0.5); // Less penalty for being above
      return { score, explanation: `Salary ${salaryRange} above target range ${criteriaRange}` };
    }
  }

  private scoreLocation(job: JobListing): { score: number; explanation: string } {
    const jobLocation = job.location.toLowerCase();
    const matchingLocations = this.criteria.locations.filter(location =>
      jobLocation.includes(location.toLowerCase()) || location.toLowerCase() === 'remote'
    );
    
    if (matchingLocations.length > 0) {
      return { score: 1, explanation: `Job location '${job.location}' matches preferred: ${matchingLocations.join(', ')}` };
    } else {
      return { score: 0.3, explanation: `Job location '${job.location}' doesn't match any preferred locations` };
    }
  }

  private scoreCompanyMatch(job: JobListing): { score: number; explanation: string } {
    let score = 0;
    let maxScore = 0;
    const explanationParts: string[] = [];
    
    const jobText = `${job.title} ${job.description} ${job.company}`.toLowerCase();
    
    // Check for domain match
    if (this.criteria.company_requirements?.domains) {
      maxScore += 0.3;
      const matchingDomains = this.criteria.company_requirements.domains.filter(domain =>
        jobText.includes(domain.toLowerCase())
      );
      if (matchingDomains.length > 0) {
        score += 0.3;
        explanationParts.push(`domain match (${matchingDomains.join(', ')})`);
      } else {
        explanationParts.push('no domain match');
      }
    }
    
    // Check for example companies
    if (this.criteria.company_requirements?.example_companies) {
      maxScore += 0.2;
      const matchingCompanies = this.criteria.company_requirements.example_companies.filter(company =>
        job.company.toLowerCase().includes(company.toLowerCase()) ||
        company.toLowerCase().includes(job.company.toLowerCase())
      );
      if (matchingCompanies.length > 0) {
        score += 0.2;
        explanationParts.push(`similar company (${matchingCompanies.join(', ')})`);
      } else {
        explanationParts.push('no similar companies');
      }
    }
    
    // Check for cultural values
    if (this.criteria.cultural_values) {
      maxScore += 0.2;
      const matchingValues = this.criteria.cultural_values.filter(value =>
        jobText.includes(value.toLowerCase())
      );
      if (matchingValues.length > 0) {
        score += 0.2 * (matchingValues.length / this.criteria.cultural_values.length);
        explanationParts.push(`cultural values (${matchingValues.join(', ')})`);
      } else {
        explanationParts.push('no cultural value matches');
      }
    }
    
    // Check for deal breakers (negative scoring)
    if (this.criteria.deal_breakers) {
      const dealBreakerFound = this.criteria.deal_breakers.some(dealBreaker => {
        if (dealBreaker.toLowerCase().includes('rto') || dealBreaker.toLowerCase().includes('return to office')) {
          return jobText.includes('5 days') && jobText.includes('office');
        }
        if (dealBreaker.toLowerCase().includes('on-call') || dealBreaker.toLowerCase().includes('oncall')) {
          return jobText.includes('on-call') || jobText.includes('oncall') || jobText.includes('pager');
        }
        return jobText.includes(dealBreaker.toLowerCase());
      });
      
      if (dealBreakerFound) {
        return { score: 0, explanation: 'Deal breaker found - immediate disqualification' };
      }
    }
    
    // Check for leadership/management requirements
    if (this.criteria.role_requirements) {
      maxScore += 0.3;
      let roleScore = 0;
      const roleMatches: string[] = [];
      
      if (this.criteria.role_requirements.leadership_level === 'player-coach') {
        if (jobText.includes('player-coach') || 
            (jobText.includes('hands-on') && jobText.includes('leadership'))) {
          roleScore += 0.1;
          roleMatches.push('player-coach');
        }
      }
      
      if (this.criteria.role_requirements.autonomy && 
          (jobText.includes('autonomy') || jobText.includes('independent'))) {
        roleScore += 0.1;
        roleMatches.push('autonomy');
      }
      
      if (this.criteria.role_requirements.strategic_involvement && 
          (jobText.includes('strategic') || jobText.includes('vision') || jobText.includes('roadmap'))) {
        roleScore += 0.1;
        roleMatches.push('strategic');
      }
      
      score += roleScore;
      if (roleMatches.length > 0) {
        explanationParts.push(`role match (${roleMatches.join(', ')})`);
      } else {
        explanationParts.push('no role requirement matches');
      }
    }
    
    // Default base score if no specific criteria
    if (maxScore === 0) {
      return { score: 0.7, explanation: 'No specific company criteria defined, using default score' };
    }
    
    const finalScore = Math.min(score / maxScore, 1);
    const explanation = explanationParts.length > 0 ? explanationParts.join(', ') : 'No matches found';
    
    return { score: finalScore, explanation };
  }

  private async generateRationale(job: JobListing, score: any): Promise<string> {
    const prompt = `
Analyze this job posting and provide a brief rationale for why it received a ${Math.round(score.overall * 100)}% match score:

Job Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Salary: ${job.salary ? `$${job.salary.min} - $${job.salary.max}` : 'Not specified'}

Score Breakdown:
- Required Skills: ${Math.round(score.breakdown.required_skills * 100)}%
- Preferred Skills: ${Math.round(score.breakdown.preferred_skills * 100)}%
- Experience Level: ${Math.round(score.breakdown.experience_level * 100)}%
- Salary: ${Math.round(score.breakdown.salary * 100)}%
- Location: ${Math.round(score.breakdown.location * 100)}%

Provide a concise 2-3 sentence rationale explaining the match quality and key factors that influenced the score.
`;

    return await this.makeOpenAIRequest(prompt);
  }

  private async generateStrategicAnalysis(job: JobListing): Promise<{
    problem_solving: string;
    hiring_archetype: string;
    differentiation: string;
  }> {
    const prompt = `
Analyze this job posting and provide strategic insights by answering these three questions:

Job Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Description: ${job.description}

Please answer the following questions with 2-3 sentences each:

1. **What problem do they think they're trying to solve?**
   Identify the core business challenge, technical pain point, or organizational need driving this hire.

2. **What archetype are they probably hiring for?**
   Describe the type of person/role archetype (e.g., "technical visionary", "execution-focused IC", "player-coach leader", "domain expert", "generalist problem-solver", etc.)

3. **Where am I differentiated or even misaligned?**
   Based on the job requirements and my criteria/background, what makes me stand out positively, and where might there be misalignment or gaps?

Return your response as a JSON object with keys: problem_solving, hiring_archetype, differentiation
`;

    const response = await this.makeOpenAIRequest(prompt);
    try {
      return JSON.parse(response);
    } catch (error) {
      // Fallback if AI doesn't return valid JSON
      return {
        problem_solving: response.split('\n')[0] || 'Unable to determine',
        hiring_archetype: response.split('\n')[1] || 'Unable to determine',
        differentiation: response.split('\n')[2] || 'Unable to determine'
      };
    }
  }

  private async generateAutoResume(jobId: string, score: number): Promise<void> {
    try {
      console.log(`🎯 Score of ${score}% exceeds threshold of ${this.autoResumeConfig.threshold}% - generating tailored resume...`);

      // Get resume generation config
      const config = getResumeGenerationConfig();

      // Create provider configs
      const resumeProviderConfig: LLMProviderConfig = {
        provider: config.resumeProvider,
        apiKey: config.resumeApiKey,
        model: config.resumeModel,
        maxTokens: config.maxTokens,
        temperature: config.temperature
      };

      const critiqueProviderConfig: LLMProviderConfig = {
        provider: config.critiqueProvider,
        apiKey: config.critiqueApiKey,
        model: config.critiqueModel,
        maxTokens: config.maxTokens,
        temperature: config.temperature
      };

      const resumeCreator = new ResumeCreatorAgent(
        resumeProviderConfig,
        critiqueProviderConfig,
        config.maxRoles
      );
      
      const result = await resumeCreator.createResume(
        jobId, 
        this.autoResumeConfig.cvPath!,
        undefined, // outputPath
        false, // regenerate  
        false, // generate
        false, // critique - disabled for auto-scoring
        'programmatic' // source
      );
      
      if (result.success) {
        console.log(`✅ Auto-generated resume: ${result.pdfPath}`);
        if (result.tailoringChanges && result.tailoringChanges.length > 0) {
          console.log(`🔧 Tailoring changes made: ${result.tailoringChanges.length} modifications`);
        }
      } else {
        console.log(`⚠️  Auto-resume generation failed: ${result.error}`);
      }
    } catch (error) {
      console.log(`⚠️  Auto-resume generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async logScore(jobScore: JobScore): Promise<void> {
    const logEntry = {
      timestamp: jobScore.timestamp,
      jobId: jobScore.jobId,
      score: jobScore.overallScore,
      rationale: jobScore.rationale,
      breakdown: jobScore.breakdown,
      explanations: jobScore.explanations,
      strategic_analysis: jobScore.strategic_analysis,
    };

    // Create job-specific subdirectory if it doesn't exist
    const jobDir = resolveFromProjectRoot('logs', jobScore.jobId);
    if (!fs.existsSync(jobDir)) {
      fs.mkdirSync(jobDir, { recursive: true });
    }

    // Save JSON score
    const jsonPath = path.join(jobDir, `score-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(logEntry, null, 2));
    console.log(`✅ Job score logged to: ${jsonPath}`);

    // Generate and save HTML report
    try {
      const jobData = await this.loadJobData(jobScore.jobId);
      const htmlReport = generateScoringReportHTML(jobData, jobScore);
      const htmlPath = path.join(jobDir, `score-report-${new Date().toISOString().replace(/[:.]/g, '-')}.html`);
      fs.writeFileSync(htmlPath, htmlReport);
      console.log(`📊 Scoring report generated: ${htmlPath}`);
    } catch (error) {
      console.warn(`⚠️  Failed to generate HTML report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
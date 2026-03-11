import { BaseLLMProvider, LLMProviderConfig } from '../providers/llm-provider';
import { ProviderFactory } from '../providers/provider-factory';
import { ClassificationResult, JobListing, RoleSelection } from '../types';
import { buildStaticInstructions, filterDomainAdaptation } from '../prompts/static-instructions';

export interface GeneratorInput {
  classification: ClassificationResult;
  job: JobListing;
  cvContent: string;
  recommendations?: string[];
  companyValues?: string;
  themes?: string;
}

export interface GeneratorResult {
  markdownContent: string;
  changes: string[];
  roleSelection: RoleSelection;
  cost: number;
  duration: number;
}

/**
 * Resume Generator Agent (Agent 2 in the two-agent pipeline)
 *
 * Takes classification from the classifier agent and generates
 * tailored resume content using prompt caching for performance.
 */
export class ResumeGeneratorAgent {
  private provider: BaseLLMProvider;
  private mode: 'builder' | 'leader';
  private experienceFormat: 'standard' | 'split';
  private maxRoles: number;

  constructor(
    providerConfig: LLMProviderConfig,
    mode: 'builder' | 'leader' = 'leader',
    experienceFormat: 'standard' | 'split' = 'standard',
    maxRoles: number = 4
  ) {
    this.provider = ProviderFactory.create(providerConfig);
    this.mode = mode;
    this.experienceFormat = experienceFormat;
    this.maxRoles = maxRoles;
  }

  async generate(input: GeneratorInput): Promise<GeneratorResult> {
    const startTime = Date.now();
    console.log(`📝 Generating resume with ${this.provider.getProviderName()}:${this.provider.getModelName()}...`);

    // Build classification section to prepend to prompt
    const classificationSection = this.buildClassificationSection(input.classification);

    // Build static instructions (cacheable - same across all generations for this user/mode)
    const staticInstructions = buildStaticInstructions({
      mode: this.mode,
      experienceFormat: this.experienceFormat,
      maxRoles: this.maxRoles
    });

    // Filter domain adaptation based on classification
    const filteredInstructions = filterDomainAdaptation(
      staticInstructions,
      input.classification.domain
    );

    // Replace CV content placeholder with actual CV (part of cacheable content)
    const instructionsWithCV = filteredInstructions
      .replace('[CV_CONTENT]', this.formatCVForPrompt(input.cvContent));

    // Build dynamic sections (change per job)
    const recommendationsSection = input.recommendations && input.recommendations.length > 0
      ? `\n\n## Recommendations from Previous Critique\n\n${input.recommendations.map(r => `- ${r}`).join('\n')}\n`
      : '';

    const companyValuesSection = input.companyValues
      ? `\n\n## Company Values\n\n${input.companyValues}\n`
      : '';

    const themesSection = input.themes
      ? `\n\n## Priority Themes\n\n${input.themes}\n`
      : '';

    // Build job-specific dynamic content
    const jobSection = `\n\nJob Posting:
Title: ${this.escapeForPrompt(input.job.title)}
Company: ${this.escapeForPrompt(input.job.company)}
Description: ${this.escapeForPrompt(input.job.description)}`;

    // Cacheable content: static instructions + CV (same for all jobs this user applies to)
    const cachedContent = instructionsWithCV
      .replace('[JOB_TITLE]', '')  // Remove placeholders from cached content
      .replace('[JOB_COMPANY]', '')
      .replace('[JOB_DESCRIPTION]', '');

    // Dynamic content: classification + job details + recommendations/values/themes
    const dynamicContent = classificationSection
      + jobSection
      + recommendationsSection
      + companyValuesSection
      + themesSection;

    // Timer for progress display
    let elapsedSeconds = 0;
    const timerInterval = setInterval(() => {
      elapsedSeconds++;
      process.stdout.write(`\r⏱️  Generator elapsed: ${elapsedSeconds}s...`);
    }, 1000);

    try {
      // Make request with prompt caching if supported
      const response = await this.provider.makeRequest({
        prompt: dynamicContent,
        cachedContent: this.provider.supportsPromptCaching() ? cachedContent : undefined,
        systemPrompt: 'You are a professional resume writer. Return ONLY valid JSON.'
      });

      clearInterval(timerInterval);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r⏱️  Generator elapsed: ${duration}s (complete)\n`);

      // Parse JSON response
      const result = this.parseGeneratorResponse(response.text);

      // Cap changes array to max 5
      if (result.changes.length > 5) {
        result.changes = result.changes.slice(0, 5);
      }

      console.log(`✅ Resume generated (${result.changes.length} changes tracked)`);
      console.log(`   Format: ${result.roleSelection.format}, Roles: ${result.roleSelection.rolesIncluded}`);
      console.log(`   Cost: $${response.cost.totalCost.toFixed(4)}`);

      if (this.provider.supportsPromptCaching() && response.usage.cachedTokens && response.usage.cachedTokens > 0) {
        console.log(`   Cache hit: ${response.usage.cachedTokens} tokens (savings: $${response.cost.cachingSavings.toFixed(4)})`);
      }

      return {
        ...result,
        cost: response.cost.totalCost,
        duration: parseFloat(duration)
      };
    } catch (error) {
      clearInterval(timerInterval);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r⏱️  Generator elapsed: ${duration}s (failed)\n`);
      throw new Error(`Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private buildClassificationSection(classification: ClassificationResult): string {
    return `CLASSIFICATION (pre-computed by classifier agent):
==================================================
DOMAIN: ${classification.domain}
ACTIVE DOMAIN SIGNALS: ${classification.domainSignals.join(', ') || 'none'}
FORMAT DECISION: ${classification.format} with ${classification.rolesIncluded} roles
REASONING: ${classification.reasoning}

INSTRUCTIONS: Use the pre-classified domain above. The domain-specific language guidance has been filtered to match this domain. Apply the corresponding emphasis rules for this domain directly.

`;
  }

  private parseGeneratorResponse(responseText: string): {
    markdownContent: string;
    changes: string[];
    roleSelection: RoleSelection;
  } {
    try {
      // Try to extract JSON from response (handle cases where LLM adds markdown formatting)
      let jsonText = responseText.trim();

      // Remove markdown code blocks if present
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/, '').replace(/\n?```$/, '').trim();
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/, '').replace(/\n?```$/, '').trim();
      }

      const parsed = JSON.parse(jsonText);

      // Validate required fields
      if (!parsed.markdownContent || !Array.isArray(parsed.changes) || !parsed.roleSelection) {
        throw new Error('Invalid response format: missing required fields');
      }

      return {
        markdownContent: parsed.markdownContent,
        changes: parsed.changes,
        roleSelection: {
          format: parsed.roleSelection.format,
          rolesIncluded: parsed.roleSelection.rolesIncluded,
          reasoning: parsed.roleSelection.reasoning || ''
        }
      };
    } catch (error) {
      console.error('Failed to parse generator response:', responseText.substring(0, 200));
      throw new Error(`Failed to parse JSON response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private escapeForPrompt(text: string): string {
    // Basic escaping for prompt injection protection
    return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  private formatCVForPrompt(cvContent: string): string {
    // Format CV content for inclusion in prompt
    // Remove excessive whitespace while preserving structure
    return cvContent
      .split('\n')
      .map(line => line.trimEnd())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}

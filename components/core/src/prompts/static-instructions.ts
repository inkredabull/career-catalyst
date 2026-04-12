import * as fs from 'fs';
import * as path from 'path';

/**
 * Static instructions for resume generation
 * This content is cached to reduce latency and cost
 */

export interface StaticInstructionsOptions {
  mode: 'builder' | 'leader';
  experienceFormat: 'standard' | 'split';
  maxRoles: number;
}

/**
 * Builds the static instruction content for prompt caching
 * This includes:
 * - Base resume generation instructions
 * - Domain adaptation guidance (all domains, unfiltered)
 * - Mode-specific fragments (builder or leader)
 * - Split experience instructions if applicable
 *
 * This content is static and can be cached with CV content
 * The dynamic parts (job description, classification) are added separately
 */
export function buildStaticInstructions(options: StaticInstructionsOptions): string {
  try {
    // Load base template
    const basePath = path.resolve('prompts', 'resume-creator-base.md');
    let promptTemplate = fs.readFileSync(basePath, 'utf-8');

    // Replace maxRoles placeholder
    promptTemplate = promptTemplate.replace(/\{\{maxRoles\}\}/g, options.maxRoles.toString());

    // Load mode-specific fragments
    const fragmentsFileName = options.mode === 'builder'
      ? 'resume-creator-builder-fragments.md'
      : 'resume-creator-leader-fragments.md';
    const fragmentsPath = path.resolve('prompts', fragmentsFileName);
    const fragments = loadFragments(fragmentsPath);

    // Override rolesSpecificInstructions if using split format
    if (options.experienceFormat === 'split') {
      const splitExperiencePath = path.resolve('prompts', 'resume-creator-split-experience.md');
      try {
        const splitExperienceContent = fs.readFileSync(splitExperiencePath, 'utf-8');
        fragments['rolesSpecificInstructions'] = splitExperienceContent.replace(/^## .+$/m, '').trim();
      } catch (error) {
        console.warn(`⚠️  Failed to load split experience template: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Replace fragment placeholders with mode-specific content
    const allPlaceholders = [
      'modeSpecificInstructions',
      'summaryGuidance',
      'rolesSpecificInstructions',
      'metricsType',
      'bulletPointGuidance',
      'verbReplacementSection',
      'technologiesSection',
      'skillsSpecificInstructions',
      'enforcementSection'
    ];

    allPlaceholders.forEach(key => {
      const placeholder = `{{${key}}}`;
      const value = fragments[key] || '';
      promptTemplate = promptTemplate.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    });

    // Replace mode placeholder
    promptTemplate = promptTemplate.replace(/{{resumeMode}}/g, options.mode.toUpperCase());

    // NOTE: Domain filtering is NOT done here - it's done in the generator based on classification
    // This allows the static instructions to be fully cacheable
    // The generator will filter domains based on ClassificationResult.domain

    // Remove the placeholders for dynamic content (will be filled by generator)
    // These will be replaced by the generator with actual values
    promptTemplate = promptTemplate
      .replace(/{{job\.title}}/g, '[JOB_TITLE]')
      .replace(/{{job\.company}}/g, '[JOB_COMPANY]')
      .replace(/{{job\.description}}/g, '[JOB_DESCRIPTION]')
      .replace(/{{cvContent}}/g, '[CV_CONTENT]')
      .replace(/{{recommendationsSection}}/g, '')
      .replace(/{{companyValuesSection}}/g, '')
      .replace(/{{themesSection}}/g, '');

    // Clean up markdown formatting
    const cleaned = promptTemplate
      .replace(/^# .+$/gm, '') // Remove markdown headers
      .replace(/^## (.+)$/gm, '$1') // Convert ## headers to plain text
      .replace(/^### (.+)$/gm, '$1') // Convert ### headers to plain text
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold formatting
      .replace(/\*(.*?)\*/g, '$1') // Remove italic formatting
      .replace(/```json[\s\S]*?```/g, (match) => {
        // Extract JSON from code block
        return match.replace(/```json\n?/, '').replace(/\n?```/, '');
      })
      .replace(/- \[ \]/g, '-') // Remove checkbox formatting
      .trim();

    return cleaned;
  } catch (error) {
    console.error(`⚠️  Failed to build static instructions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
}

/**
 * Filters domain adaptation section based on classification result
 * Called by the generator after classification
 */
export function filterDomainAdaptation(
  instructions: string,
  domain: 'regulated' | 'enterprise' | 'platform' | 'general'
): string {
  // Extract the Domain Adaptation section
  const domainSectionMatch = instructions.match(/Domain Adaptation & Vocabulary[\s\S]*?(?=Intelligent Role Selection|$)/);
  if (!domainSectionMatch) return instructions;

  const fullDomainSection = domainSectionMatch[0];

  // Extract individual domain subsections
  // Order in prompt: Regulated → Global → Enterprise → Platform → Forward Deployed → AI/LLM
  const sections: Record<string, RegExp> = {
    regulated: /Regulated \/ High-Trust Environments[\s\S]*?(?=Global \/ International|Enterprise \/ Scale Stage|Platform Engineering|Forward Deployed|AI\/LLM Roles|Intelligent Role Selection|$)/,
    enterprise: /Enterprise \/ Scale Stage[\s\S]*?(?=Platform Engineering|Forward Deployed|AI\/LLM Roles|Intelligent Role Selection|$)/,
    platform: /Platform Engineering \/ Infrastructure Leadership[\s\S]*?(?=Forward Deployed|AI\/LLM Roles|Intelligent Role Selection|$)/,
    'forward-deployed': /Forward Deployed \/ Customer-Facing Roles[\s\S]*?(?=AI\/LLM Roles|Intelligent Role Selection|$)/
  };

  // Special case: 'general' means keep only the header
  if (domain === 'general') {
    const filtered = instructions.replace(
      /Domain Adaptation & Vocabulary[\s\S]*?(?=Intelligent Role Selection|$)/,
      'Domain Adaptation & Vocabulary\n\nUse language and framing appropriate to the target role and company context.\n\n'
    );
    return filtered;
  }

  // Extract the relevant domain section
  const relevantSectionMatch = fullDomainSection.match(sections[domain]);
  const relevantSection = relevantSectionMatch ? relevantSectionMatch[0] : '';

  // Always include Global/International section — triggered by company name or JD keywords, not by domain
  const globalSectionMatch = fullDomainSection.match(/Global \/ International \/ Multilingual Environments[\s\S]*?(?=Enterprise \/ Scale Stage|Platform Engineering|Forward Deployed|AI\/LLM Roles|Intelligent Role Selection|$)/);
  const globalSection = globalSectionMatch ? globalSectionMatch[0] : '';

  // Always include AI/LLM section if present
  const aiSectionMatch = fullDomainSection.match(/AI\/LLM Roles - Technical Depth Requirements[\s\S]*?(?=Intelligent Role Selection|$)/);
  const aiSection = aiSectionMatch ? aiSectionMatch[0] : '';

  // Build filtered section
  let filteredSection = 'Domain Adaptation & Vocabulary\n\n**CRITICAL**: Adapt your language to match the domain and maturity stage of the company:\n\n';

  if (relevantSection) {
    filteredSection += relevantSection + '\n\n';
  }

  if (globalSection) {
    filteredSection += globalSection + '\n\n';
  }

  if (aiSection) {
    filteredSection += aiSection + '\n\n';
  }

  // Replace the full domain section with the filtered one
  return instructions.replace(
    /Domain Adaptation & Vocabulary[\s\S]*?(?=Intelligent Role Selection|$)/,
    filteredSection
  );
}

function loadFragments(fragmentsPath: string): Record<string, string> {
  try {
    const fragmentsContent = fs.readFileSync(fragmentsPath, 'utf-8');
    const fragments: Record<string, string> = {};

    // Parse fragments using regex to find ### sectionName blocks
    const fragmentRegex = /### (\w+)\n((?:(?!### \w+)[\s\S])*)/g;
    let match;

    while ((match = fragmentRegex.exec(fragmentsContent)) !== null) {
      const [, sectionName, sectionContent] = match;
      fragments[sectionName] = sectionContent.trim();
    }

    return fragments;
  } catch (error) {
    console.warn(`⚠️  Failed to load fragments from ${fragmentsPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return {};
  }
}

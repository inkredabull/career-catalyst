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
  bulletViolations?: string[];
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
        cachedContent, // always pass; provider decides whether to cache or concatenate
        systemPrompt: 'You are a professional resume writer. Return ONLY a valid JSON object with exactly these three fields: markdownContent (string), changes (array of strings), roleSelection (object with format, rolesIncluded, reasoning). No other fields. No markdown code fences. No explanation.'
      });

      clearInterval(timerInterval);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r⏱️  Generator elapsed: ${duration}s (complete)\n`);

      // Parse JSON response
      const result = this.parseGeneratorResponse(response.text);

      // Post-process: fix hard-wrapped bullets (join 2-space continuation lines)
      result.markdownContent = this.fixHardWrappedBullets(result.markdownContent);

      // Post-process: ensure \pagebreak before RELATED EXPERIENCE (split format)
      result.markdownContent = this.ensurePagebreakBeforeRelatedExperience(result.markdownContent);

      // Post-process: fix Gemini/model quirk of using **SECTION NAME** bold instead of ## heading
      result.markdownContent = this.normalizeSectionHeadings(result.markdownContent);

      // Post-process: indent subsection headers and Technologies lines to align with bullet left margin
      result.markdownContent = this.indentSubsectionHeaders(result.markdownContent);
      result.markdownContent = this.indentTechnologiesLines(result.markdownContent);

      // Post-process: trim bullets that still exceed 80 chars via a targeted LLM rewrite
      result.markdownContent = await this.trimLongBullets(result.markdownContent);

      // Post-process: warn on remaining long role bullets after trimming
      const bulletViolations = this.warnLongBullets(result.markdownContent);

      // Cap changes array to max 5
      if (result.changes.length > 5) {
        result.changes = result.changes.slice(0, 5);
      }

      console.log(`✅ Resume generated (${result.changes.length} changes tracked)`);
      console.log(`   Format: ${result.roleSelection.format}, Roles: ${result.roleSelection.rolesIncluded}`);
      console.log(`   Cost: $${response.cost.totalCost.toFixed(4)}`);

      if (this.provider.supportsPromptCaching()) {
        if (response.usage.cachedTokens && response.usage.cachedTokens > 0) {
          console.log(`   Cache hit: ${response.usage.cachedTokens} tokens (savings: $${response.cost.cachingSavings.toFixed(4)})`);
        } else if (response.usage.cacheWriteTokens && response.usage.cacheWriteTokens > 0) {
          console.log(`   Cache write: ${response.usage.cacheWriteTokens} tokens`);
        }
      }

      return {
        ...result,
        cost: response.cost.totalCost,
        duration: parseFloat(duration),
        bulletViolations: bulletViolations.length > 0 ? bulletViolations : undefined
      };
    } catch (error) {
      clearInterval(timerInterval);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r⏱️  Generator elapsed: ${duration}s (failed)\n`);
      throw new Error(`Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Joins hard-wrapped bullet continuation lines (lines starting with 2+ spaces
   * that follow a bullet) into single unbroken lines. This fixes models that
   * pre-wrap bullets in source markdown, which causes rendering issues in pandoc PDF.
   */
  private fixHardWrappedBullets(markdown: string): string {
    const lines = markdown.split('\n');
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // If this is a continuation line (starts with 2+ spaces, not a list item or code)
      if (/^  +[^ \-*]/.test(line) && out.length > 0 && /^- /.test(out[out.length - 1])) {
        // Join onto previous bullet with a space
        out[out.length - 1] = out[out.length - 1].trimEnd() + ' ' + line.trimStart();
      } else {
        out.push(line);
      }
    }
    return out.join('\n');
  }

  /**
   * Fixes model quirk (most common with Gemini) of emitting section headings as
   * **SECTION NAME** bold lines instead of ## SECTION NAME markdown headings.
   * Must run before indentSubsectionHeaders, which would otherwise indent them.
   */
  private normalizeSectionHeadings(markdown: string): string {
    const sectionNames = ['RELEVANT EXPERIENCE', 'RELATED EXPERIENCE', 'SKILLS', 'EDUCATION', 'BEYOND WORK', 'EARLIER CAREER'];
    for (const name of sectionNames) {
      markdown = markdown.replace(new RegExp(`^\\*\\*${name}\\*\\*$`, 'gm'), `## ${name}`);
    }
    return markdown;
  }

  /**
   * Indents standalone bold subsection headers to align with bullet left margin.
   * Uses pandoc inline raw LaTeX (`\hspace*{1.5em}`{=latex}) so the space is:
   *   - Actually applied at line start (\hspace* is non-discardable, unlike \hspace)
   *   - Not interpreted as a block command (avoids the vertical gap issue)
   * Matches lines that are exactly **Theme Name** with no @ (avoids role title lines).
   */
  private indentSubsectionHeaders(markdown: string): string {
    return markdown.replace(/^(\*\*[^*\n@]+\*\*)$/gm, '`\\hspace*{1.5em}`{=latex}$1');
  }

  /**
   * Indents Technologies: lines to align with bullet left margin, same mechanism
   * as subsection headers — pandoc inline raw LaTeX with \hspace* (non-discardable).
   */
  private indentTechnologiesLines(markdown: string): string {
    return markdown.replace(/^(\*\*Technologies:\*\*.+)$/gm, '`\\hspace*{1.5em}`{=latex}$1');
  }

  /**
   * Ensures \pagebreak lands after the 3rd role in RELEVANT EXPERIENCE (split format).
   * Falls back to inserting before ## RELATED EXPERIENCE if role detection fails.
   * Strips any existing \pagebreak first to avoid duplicates.
   */
  private ensurePagebreakBeforeRelatedExperience(markdown: string): string {
    // Strip any existing pagebreaks
    let clean = markdown.replace(/\\pagebreak\s*\n/g, '');

    const relevantMatch = clean.match(/## RELEVANT EXPERIENCE\n([\s\S]*?)(?=\n## )/);
    if (relevantMatch) {
      const relevantBlock = relevantMatch[1];
      const roleLines = [...relevantBlock.matchAll(/^\*\*[^*]+\*\*\s*@\s*.+$/gm)];

      // If there are more than 3 roles, insert pagebreak before the 4th
      if (roleLines.length > 3 && roleLines[3].index !== undefined) {
        const relevantStart = clean.indexOf(relevantMatch[1]);
        const fourthRoleAbsPos = relevantStart + roleLines[3].index;
        const before = clean.slice(0, fourthRoleAbsPos).replace(/\n+$/, '');
        const after = clean.slice(fourthRoleAbsPos);
        return `${before}\n\n\\pagebreak\n${after}`;
      }
    }

    // Fallback: insert before ## RELATED EXPERIENCE
    if (clean.includes('## RELATED EXPERIENCE')) {
      return clean.replace(/(## RELATED EXPERIENCE)/g, '\\pagebreak\n$1');
    }

    return clean;
  }

  /**
   * Batch-rewrites all role bullets exceeding 80 characters via a targeted LLM call.
   * Sends overlong bullets in one request; replaces originals in the markdown.
   * Skills lines (bold-prefixed) are excluded — they have a wider limit.
   */
  private async trimLongBullets(markdown: string): Promise<string> {
    const longBullets: string[] = [];
    for (const line of markdown.split('\n')) {
      if (/^- \*\*/.test(line)) continue; // skills category line
      if (/^- /.test(line) && line.length > 80) {
        longBullets.push(line);
      }
    }
    if (longBullets.length === 0) return markdown;

    console.log(`✂️  Trimming ${longBullets.length} overlong bullet(s) via LLM...`);

    const prompt = `Rewrite each bullet point below to be ≤80 characters (including the leading "- "). Preserve the core action verb, primary metric, and most important detail. Do not add new information. Return ONLY a JSON array of rewritten strings, one per input, same order, no explanation.

Bullets to rewrite:
${JSON.stringify(longBullets)}`;

    let rewritten: string[];
    try {
      const response = await this.provider.makeRequest({
        prompt,
        systemPrompt: 'You are a resume editor. Return ONLY a valid JSON array of strings. No markdown, no explanation.'
      });

      let jsonText = response.text.trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
      rewritten = JSON.parse(jsonText) as string[];

      if (!Array.isArray(rewritten) || rewritten.length !== longBullets.length) {
        console.warn('⚠️  trimLongBullets: unexpected response shape, skipping trim');
        return markdown;
      }

      console.log(`   Trim cost: $${response.cost.totalCost.toFixed(4)}`);
    } catch (err) {
      console.warn(`⚠️  trimLongBullets failed (${err instanceof Error ? err.message : err}), skipping`);
      return markdown;
    }

    // Replace originals in markdown (exact string match)
    let result = markdown;
    for (let i = 0; i < longBullets.length; i++) {
      const original = longBullets[i]!;
      const replacement = rewritten[i]!;
      // Only replace first occurrence to avoid stomping duplicate bullets
      result = result.replace(original, replacement);
    }
    return result;
  }

  /**
   * Logs a warning for any role bullet exceeding 90 characters and returns them
   * as regen feedback strings so the critique→regen loop can inject them.
   * Skills lines (bold-prefixed) are skipped since they have a separate 95-char limit.
   */
  private warnLongBullets(markdown: string): string[] {
    const violations: string[] = [];
    for (const line of markdown.split('\n')) {
      if (/^- \*\*/.test(line)) continue; // skills category line
      if (/^- /.test(line) && line.length > 90) {
        const preview = line.slice(2, 62);
        violations.push(`Bullet too long (${line.length} chars) — rewrite to ≤80 chars: "${preview}..."`);
      }
    }
    if (violations.length > 0) {
      console.log(`⚠️  ${violations.length} bullet(s) exceed 90 chars:`);
      violations.forEach(v => console.log(`  ${v}`));
    }
    return violations;
  }

  private buildClassificationSection(classification: ClassificationResult): string {
    return `CLASSIFICATION (pre-computed by classifier agent):
==================================================
DOMAIN: ${classification.domain}
ACTIVE DOMAIN SIGNALS: ${classification.domainSignals.join(', ') || 'none'}
FORMAT (MANDATORY — DO NOT OVERRIDE): ${classification.format}
TARGET ROLE COUNT: ${classification.rolesIncluded} (soft target — go up to 2 more if needed to fill a second page or surface important differentiating experience)
REASONING: ${classification.reasoning}

INSTRUCTIONS: Use the pre-classified domain above. The domain-specific language guidance has been filtered to match this domain. Apply the corresponding emphasis rules for this domain directly.

`;
  }

  private parseGeneratorResponse(responseText: string): {
    markdownContent: string;
    changes: string[];
    roleSelection: RoleSelection;
  } {
    // Strip markdown code fences (any variant: ```json, ```, with any surrounding whitespace)
    let jsonText = responseText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(jsonText) as Record<string, unknown>;
    } catch (_firstError) {
      // JSON parse failed — try to extract markdownContent by scanning the raw string
      const recovered = this.extractMarkdownContent(responseText);
      if (recovered !== null) {
        return {
          markdownContent: recovered,
          changes: [],
          roleSelection: { format: 'standard', rolesIncluded: 4, reasoning: '' }
        };
      }
      console.error('Failed to parse generator response:', responseText.substring(0, 300));
      throw new Error(`Failed to parse JSON response: ${_firstError instanceof Error ? _firstError.message : 'Unknown error'}`);
    }

    const markdownContent = typeof parsed['markdownContent'] === 'string' ? parsed['markdownContent'] : '';
    if (!markdownContent) {
      console.error('Failed to parse generator response:', responseText.substring(0, 300));
      throw new Error('Invalid response format: markdownContent missing or empty');
    }

    const changesRaw = parsed['changes'];
    const changes: string[] = Array.isArray(changesRaw) ? (changesRaw as string[]) : [];

    const rsRaw = parsed['roleSelection'] as Record<string, unknown> | undefined;
    const roleSelection: RoleSelection = {
      format: (typeof rsRaw?.['format'] === 'string' ? rsRaw['format'] : 'standard') as 'standard' | 'split',
      rolesIncluded: typeof rsRaw?.['rolesIncluded'] === 'number' ? (rsRaw['rolesIncluded'] as number) : 4,
      reasoning: typeof rsRaw?.['reasoning'] === 'string' ? (rsRaw['reasoning'] as string) : ''
    };

    return { markdownContent, changes, roleSelection };
  }

  /**
   * Scans raw LLM response text to extract the markdownContent string value
   * even when the surrounding JSON is malformed (extra fields, unquoted keys, etc.).
   */
  private extractMarkdownContent(responseText: string): string | null {
    const marker = '"markdownContent"';
    const markerIdx = responseText.indexOf(marker);
    if (markerIdx === -1) return null;

    // Find the colon after the key
    let i = markerIdx + marker.length;
    while (i < responseText.length && /\s/.test(responseText[i]!)) i++;
    if (responseText[i] !== ':') return null;
    i++;
    while (i < responseText.length && /\s/.test(responseText[i]!)) i++;
    if (responseText[i] !== '"') return null;
    i++; // skip opening quote

    // Scan the string value, respecting escape sequences
    let value = '';
    while (i < responseText.length) {
      const ch = responseText[i]!;
      if (ch === '\\' && i + 1 < responseText.length) {
        const next = responseText[i + 1]!;
        switch (next) {
          case '"': value += '"'; break;
          case '\\': value += '\\'; break;
          case 'n': value += '\n'; break;
          case 'r': value += '\r'; break;
          case 't': value += '\t'; break;
          default: value += next;
        }
        i += 2;
      } else if (ch === '"') {
        // End of string
        return value || null;
      } else {
        value += ch;
        i++;
      }
    }
    return null; // unterminated string
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

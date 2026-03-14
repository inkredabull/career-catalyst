import { BaseAgent } from './base-agent';
import { JobListing, ExtractorResult, AgentConfig } from '../types';
import { WebScraper } from '../utils/web-scraper';
import { JobScorerAgent } from './job-scorer-agent';
import { ResumeCreatorAgent } from './resume-creator-agent';
import { LLMProviderConfig } from '../providers/llm-provider';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as yaml from 'js-yaml';
import { createSheetsLogger } from '../integrations/sheets-logger';

export class JobExtractorAgent extends BaseAgent {
  constructor(config: AgentConfig) {
    super(config);
  }

  async extractFromInput(input: string, type: 'url' | 'html' | 'json' | 'jsonfile', options?: { ignoreCompetition?: boolean; reminderPriority?: number; skipReminders?: boolean; skipPostWorkflow?: boolean; selectedReminders?: string[] }): Promise<ExtractorResult> {
    switch (type) {
      case 'url':
        return this.extractFromUrl(input, options);
      case 'html':
        return this.extractFromHtml(input, options);
      case 'json':
        return this.extractFromJson(input, options);
      case 'jsonfile':
        return this.extractFromJsonFile(input, options);
      default:
        return {
          success: false,
          error: `Invalid input type: ${type}. Must be 'url', 'html', 'json', or 'jsonfile'`
        };
    }
  }

  async extractFromUrl(url: string, options?: { ignoreCompetition?: boolean; reminderPriority?: number; skipReminders?: boolean; skipPostWorkflow?: boolean; selectedReminders?: string[] }): Promise<ExtractorResult> {
    try {
      // Fetch HTML
      const html = await WebScraper.fetchHtml(url);
      return this.extractFromHtml(html, options, url);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async extractFromHtml(html: string, options?: { ignoreCompetition?: boolean; reminderPriority?: number; skipReminders?: boolean; skipPostWorkflow?: boolean; selectedReminders?: string[] }, sourceUrl?: string): Promise<ExtractorResult> {
    try {
      // Check applicant count first - early exit if too competitive (unless overridden)
      const applicantInfo = this.extractApplicantCount(html);
      if (applicantInfo.shouldExit && !options?.ignoreCompetition) {
        console.log(`🚫 Job has ${applicantInfo.count} applicants (>${applicantInfo.threshold}) - skipping due to high competition`);
        return {
          success: false,
          error: `Too many applicants (${applicantInfo.count}) - competition level too high`,
          competitionReason: {
            applicantCount: applicantInfo.count,
            threshold: applicantInfo.threshold,
            competitionLevel: applicantInfo.competitionLevel
          }
        };
      }
      
      // If competition would normally block extraction but was overridden, log it
      if (applicantInfo.shouldExit && options?.ignoreCompetition) {
        console.log(`⚠️  Job has ${applicantInfo.count} applicants (>${applicantInfo.threshold}) - extracting anyway due to --force-extract flag`);
      }
      
      // If applicant count detected but within threshold, log it
      if (applicantInfo.count > 0) {
        console.log(`👥 ${applicantInfo.count} applicants detected - competition level: ${applicantInfo.competitionLevel}`);
      }
      
      // Extract job data from HTML/structured data
      const jobData = await this.extractJobDataFromHtml(html, applicantInfo);
      
      // Generate unique job ID using timestamp + random for guaranteed uniqueness
      const jobId = this.generateJobId();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      // Create job-specific subdirectory
      const jobDir = path.join('logs', jobId);
      if (!fs.existsSync(jobDir)) {
        fs.mkdirSync(jobDir, { recursive: true });
      }
      
      const logFileName = `job-${timestamp}.json`;
      const logFilePath = path.join(jobDir, logFileName);

      // Save JSON to log file with jobId included
      const jobDataWithSource = {
        ...jobData,
        jobId,  // Add the jobId to the saved data
        titleShorthand: this.buildTitleShorthand(jobData.title || ''),
        source: sourceUrl ? "extracted" : "html_parsed"
      };
      const jsonOutput = JSON.stringify(jobDataWithSource, null, 2);
      fs.writeFileSync(logFilePath, jsonOutput, 'utf-8');
      console.log(`✅ Job information logged to ${logFilePath}`);

      // Create reminder for tracked job (unless --no-reminders flag is set)
      if (!options?.skipReminders) {
        await this.createJobReminder(jobDataWithSource, jobId, sourceUrl, options?.reminderPriority, options?.selectedReminders);
      } else {
        console.log('⏭️  Skipping reminder creation (--no-reminders flag set)');
      }

      // Run post-extraction workflow (score, resume, critique) unless skipped
      if (!options?.skipPostWorkflow) {
        await this.runPostExtractionWorkflow(jobId, jobDataWithSource);
      } else {
        console.log('⏭️  Skipping post-extraction workflow (scoring, resume generation)');
      }

      return {
        success: true,
        data: jobDataWithSource,
        jobId: jobId
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async extractFromJson(jsonInput: string, options?: { ignoreCompetition?: boolean; reminderPriority?: number; skipReminders?: boolean; skipPostWorkflow?: boolean; selectedReminders?: string[] }, sourceUrl?: string): Promise<ExtractorResult> {
    try {
      // Parse the JSON input
      let jobData: any;
      try {
        jobData = JSON.parse(jsonInput);
      } catch (parseError) {
        return {
          success: false,
          error: 'Invalid JSON input: ' + (parseError instanceof Error ? parseError.message : 'Unknown parsing error')
        };
      }

      // Map to expected job schema
      const normalizedJobData = this.normalizeJobData(jobData);

      // Generate unique job ID using timestamp + random for guaranteed uniqueness
      const jobId = this.generateJobId();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      // Create job-specific subdirectory
      const jobDir = path.join('logs', jobId);
      if (!fs.existsSync(jobDir)) {
        fs.mkdirSync(jobDir, { recursive: true });
      }
      
      const logFileName = `job-${timestamp}.json`;
      const logFilePath = path.join(jobDir, logFileName);

      // Save JSON to log file
      const jobDataWithSource = {
        ...normalizedJobData,
        titleShorthand: this.buildTitleShorthand(normalizedJobData.title || ''),
        source: "json_input"
      };
      const jsonOutput = JSON.stringify(jobDataWithSource, null, 2);
      fs.writeFileSync(logFilePath, jsonOutput, 'utf-8');
      console.log(`✅ Job information logged to ${logFilePath}`);

      // Create reminder for tracked job (unless --no-reminders flag is set)
      if (!options?.skipReminders) {
        await this.createJobReminder(jobDataWithSource, jobId, sourceUrl, options?.reminderPriority, options?.selectedReminders);
      } else {
        console.log('⏭️  Skipping reminder creation (--no-reminders flag set)');
      }

      // Run post-extraction workflow (score, resume, critique) unless skipped
      if (!options?.skipPostWorkflow) {
        await this.runPostExtractionWorkflow(jobId, jobDataWithSource);
      } else {
        console.log('⏭️  Skipping post-extraction workflow (scoring, resume generation)');
      }

      return {
        success: true,
        data: jobDataWithSource,
        jobId: jobId
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async extractFromJsonFile(filePath: string, options?: { ignoreCompetition?: boolean; reminderPriority?: number; skipReminders?: boolean; skipPostWorkflow?: boolean; selectedReminders?: string[] }): Promise<ExtractorResult> {
    try {
      // Read the JSON file
      const jsonContent = fs.readFileSync(filePath, 'utf-8');
      
      // Extract URL from JSON data to pass to extractFromJson
      let sourceUrl: string | undefined;
      try {
        const parsedData = JSON.parse(jsonContent);
        sourceUrl = parsedData.url || parsedData.jobUrl || parsedData.sourceUrl;
      } catch (parseError) {
        // If JSON parsing fails, let extractFromJson handle the error
      }
      
      // Call the existing extractFromJson method with the file content and extracted URL
      return this.extractFromJson(jsonContent, options, sourceUrl);
      
    } catch (error) {
      return {
        success: false,
        error: `Failed to read JSON file: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private buildTitleShorthand(title: string): string {
    return title
      .split(/\s+/)
      .filter(w => w.length > 0)
      .map(w => w[0].toUpperCase())
      .join('');
  }

  private cleanUrl(url: string | undefined): string | undefined {
    if (!url) return undefined;

    try {
      const urlObj = new URL(url);

      // List of tracking parameters to remove
      const trackingParams = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'utm_id', 'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
        'fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid',
        '_ga', '_gl', '_ke', 'ref', 'referrer'
      ];

      // Remove tracking parameters
      trackingParams.forEach(param => {
        urlObj.searchParams.delete(param);
      });

      // Return cleaned URL
      let cleanedUrl = urlObj.origin + urlObj.pathname;

      // Add back non-tracking query parameters if any remain
      const remainingParams = urlObj.searchParams.toString();
      if (remainingParams) {
        cleanedUrl += '?' + remainingParams;
      }

      // Add hash if present
      if (urlObj.hash) {
        cleanedUrl += urlObj.hash;
      }

      return cleanedUrl;
    } catch (error) {
      // If URL parsing fails, return original
      console.warn(`Failed to parse URL for cleaning: ${url}`);
      return url;
    }
  }

  private normalizeJobData(inputData: any): JobListing {
    // Map various JSON structures to our expected schema

    // Handle salary from multiple sources
    let salaryData = inputData.salary || inputData.compensation || inputData.pay;
    
    // If no salary object but we have minSalary/maxSalary from form, create salary object
    if (!salaryData && (inputData.minSalary || inputData.maxSalary)) {
      salaryData = {
        min: inputData.minSalary || '',
        max: inputData.maxSalary || '',
        currency: 'USD'
      };
    }
    
    const company = inputData.company || inputData.company_name || inputData.employer || '';
    
    const description = inputData.description || inputData.job_description || inputData.details || '';
    let normalizedSalary = this.normalizeSalary(salaryData); // Always returns a salary structure
    
    // If salary is empty but we have a description, try to extract salary from description text
    if ((!normalizedSalary.min || normalizedSalary.min === '') && 
        (!normalizedSalary.max || normalizedSalary.max === '') && 
        description) {
      const salaryFromDescription = this.extractSalaryFromText(description);
      if (salaryFromDescription) {
        normalizedSalary = salaryFromDescription;
      }
    }
    
    // Extract and clean URL (remove tracking parameters)
    const rawUrl = inputData.url || inputData.jobUrl || inputData.sourceUrl || inputData.job_url || undefined;
    const cleanedUrl = this.cleanUrl(rawUrl);

    return {
      title: inputData.title || inputData.job_title || inputData.position || inputData.role || '',
      company: company,
      location: inputData.location || inputData.job_location || inputData.work_location || '',
      description: description,
      url: cleanedUrl,
      salary: normalizedSalary,
      applicantCount: inputData.applicantCount || inputData.applicant_count,
      competitionLevel: inputData.competitionLevel || inputData.competition_level,
      linkedInCompany: inputData.linkedInCompany || inputData.linked_in || inputData.linkedin_company ||
                       (company ? this.convertToLinkedInSlug(company) : undefined)
    };
  }

  private normalizeSalary(salaryInput: any): { min: string; max: string; currency: string } {
    if (!salaryInput) {
      return { min: '', max: '', currency: 'USD' };
    }
    
    if (typeof salaryInput === 'object') {
      // Handle object input with min/max fields
      let min = salaryInput.min || salaryInput.minimum || '';
      let max = salaryInput.max || salaryInput.maximum || '';
      
      // Normalize string values if they exist
      if (min && typeof min === 'string') {
        const minAmount = this.normalizeSalaryAmount(min.replace(/\$/g, ''));
        min = `$${minAmount.toLocaleString()}`;
      }
      if (max && typeof max === 'string') {
        const maxAmount = this.normalizeSalaryAmount(max.replace(/\$/g, ''));
        max = `$${maxAmount.toLocaleString()}`;
      }
      
      return {
        min: min,
        max: max,
        currency: salaryInput.currency || 'USD'
      };
    }
    
    if (typeof salaryInput === 'string') {
      // Use the enhanced salary extraction from text
      const parsed = this.extractSalaryFromText(salaryInput);
      if (parsed) {
        return parsed;
      }
      
      // Fallback: try basic parsing for simple formats not caught by extractSalaryFromText
      const cleanInput = salaryInput.trim();
      
      // Try to parse simple ranges like "$100,000-$150,000" or "100000-150000"
      const rangeMatch = cleanInput.match(/\$?([\d,]+)k?\s*[-–—]\s*\$?([\d,]+)k?/i);
      if (rangeMatch) {
        const min = this.normalizeSalaryAmount(rangeMatch[1]);
        const max = this.normalizeSalaryAmount(rangeMatch[2]);
        
        return {
          min: `$${min.toLocaleString()}`,
          max: `$${max.toLocaleString()}`,
          currency: 'USD'
        };
      }
      
      // Single salary value - try to normalize it
      const singleMatch = cleanInput.match(/\$?([\d,]+)k?/i);
      if (singleMatch) {
        const amount = this.normalizeSalaryAmount(singleMatch[1]);
        const salary = `$${amount.toLocaleString()}`;
        return {
          min: salary,
          max: salary,
          currency: 'USD'
        };
      }
      
      // If we can't parse it, return as-is
      return {
        min: cleanInput,
        max: cleanInput,
        currency: 'USD'
      };
    }
    
    // Handle number input
    if (typeof salaryInput === 'number') {
      const salary = `$${salaryInput.toLocaleString()}`;
      return {
        min: salary,
        max: salary,
        currency: 'USD'
      };
    }
    
    // Fallback for any unhandled cases
    return { min: '', max: '', currency: 'USD' };
  }

  // Keep backward compatibility
  async extract(url: string, options?: { ignoreCompetition?: boolean }): Promise<ExtractorResult> {
    return this.extractFromUrl(url, options);
  }

  private createExtractionPrompt(html: string): string {
    return `
Extract job information from the following HTML content and return it as a JSON object that matches this exact schema:

{
  "title": "job title",
  "company": "company name",
  "location": "job location",
  "description": "full job description text",
  "linkedInCompany": "company linkedin slug (auto-generated from company name)",
  "salary": {
    "min": "minimum salary as formatted string (e.g., '$150,000')",
    "max": "maximum salary as formatted string (e.g., '$200,000')", 
    "currency": "currency code (e.g., USD, EUR)"
  }
}

Rules:
- Return ONLY valid JSON, no other text or markdown
- For salary extraction, look for various formats including:
  * "Salary Range: $150,000 - $200,000"
  * "$150k-$200k"
  * "Between $150,000 and $200,000"
  * "Up to $200,000"
  * "Starting from $150,000"
  * "150K-200K annually"
- If salary information is not available, omit the salary field entirely
- If only one salary value is provided, use it as both min and max
- Format salary values with dollar sign and commas (e.g., "$150,000", "$200,000")
- Convert 'k' or 'K' suffix to full amounts (e.g., "150k" becomes "$150,000")
- For linkedInCompany: convert company name to lowercase, replace spaces with hyphens, remove special characters (e.g., "Microsoft Corp" → "microsoft-corp")
- Extract the complete job description including responsibilities, requirements, and benefits
- Use the exact company name as it appears on the page
- For location, use the format "City, State" or "City, Country"

HTML Content:
${html.slice(0, 8000)}...

JSON:`;
  }

  private extractApplicantCount(html: string): { count: number; shouldExit: boolean; threshold: number; competitionLevel: 'low' | 'medium' | 'high' | 'extreme' } {
    const threshold = 200;
    let count = 0;
    let competitionLevel: 'low' | 'medium' | 'high' | 'extreme' = 'low';

    // Look for applicant count in HTML

    // patterns - enhanced with more variations
    const sourcePatterns = [
      /(\d{1,3}(?:,\d{3})*)\s+(?:candidates?\s+who\s+)?clicked\s+apply/i,
      /(\d{1,3}(?:,\d{3})*)\s+applicants?/i,
      /Over\s+(\d{1,3}(?:,\d{3})*)\s+(?:candidates?\s+who\s+)?clicked\s+apply/i,
      /(\d{1,3}(?:,\d{3})*)\s+people\s+clicked\s+apply/i,
      /Be\s+among\s+the\s+first\s+(\d+)\s+applicants?/i,
      /(\d{1,3}(?:,\d{3})*)\s+candidates?/i,
      /(\d{1,3}(?:,\d{3})*)\s+(?:people\s+)?applied/i
    ];
    
    // Special handling for "Over X" cases - treat as minimum estimate
    const overPattern = /Over\s+(\d{1,3}(?:,\d{3})*)\s+(?:appli|candidate)/i;
    const overMatch = html.match(overPattern);
    if (overMatch && overMatch[1]) {
      const overCount = parseInt(overMatch[1].replace(/,/g, ''), 10);
      if (!isNaN(overCount)) {
        // For "Over X" cases, multiply by a conservative factor to estimate real count
        // "Over 200" likely means 300-2000+ applicants, so use conservative 2x multiplier
        count = Math.max(overCount * 2, 300); 
        console.log(`📊 Detected "Over ${overCount}" → estimated ${count} applicants (high competition)`);
      }
    }

    // Indeed patterns
    const indeedPatterns = [
      /(\d{1,3}(?:,\d{3})*)\s+applicants?/i,
      /Applied\s+by\s+(\d{1,3}(?:,\d{3})*)\s+people/i
    ];

    // Try all patterns only if we haven't found an "Over X" case
    if (count === 0) {
      const allPatterns = [...sourcePatterns, ...indeedPatterns];
      
      for (let i = 0; i < allPatterns.length; i++) {
        const pattern = allPatterns[i];
        const match = html.match(pattern);
        if (match && match[1]) {
          const foundCount = parseInt(match[1].replace(/,/g, ''), 10);
          if (!isNaN(foundCount)) {
            count = foundCount;
            break;
          }
        }
      }
    }

    // Determine competition level
    if (count === 0) {
      competitionLevel = 'low';
    } else if (count <= 50) {
      competitionLevel = 'low';
    } else if (count <= 200) {
      competitionLevel = 'medium';
    } else if (count <= 500) {
      competitionLevel = 'high';
    } else {
      competitionLevel = 'extreme';
    }

    const shouldExit = count > threshold;

    return {
      count,
      shouldExit,
      threshold,
      competitionLevel
    };
  }

  private parseStructuredData(jsonLd: any, applicantInfo?: { count: number; competitionLevel: 'low' | 'medium' | 'high' | 'extreme' }): JobListing {
    try {
      // Extract fields from JSON-LD JobPosting
      let location = this.extractLocation(jsonLd.jobLocation);
      
      // Handle remote work designation
      if (jsonLd.jobLocationType === 'TELECOMMUTE' || jsonLd.jobLocationType === 'REMOTE') {
        if (location && location !== 'United States') {
          location = `Remote (${location})`;
        } else {
          location = 'Remote';
        }
      }
      
      // Clean up HTML description if present
      let description = jsonLd.description || '';
      if (description.includes('<')) {
        // Simple HTML tag removal - convert HTML to plain text
        description = description
          .replace(/<[^>]*>/g, ' ')                    // Remove HTML tags
          .replace(/&nbsp;/g, ' ')                     // Replace &nbsp; with space
          .replace(/&amp;/g, '&')                      // Replace &amp; with &
          .replace(/&lt;/g, '<')                       // Replace &lt; with <
          .replace(/&gt;/g, '>')                       // Replace &gt; with >
          .replace(/&quot;/g, '"')                     // Replace &quot; with "
          .replace(/\s+/g, ' ')                        // Normalize whitespace
          .trim();
      }
      
      const company = jsonLd.hiringOrganization?.name || '';
      
      const jobData: JobListing = {
        title: jsonLd.title || jsonLd.identifier?.name || '',
        company: company,
        location: location,
        description: description,
        salary: { min: '', max: '', currency: 'USD' }, // Will be updated below if found
        linkedInCompany: company ? this.convertToLinkedInSlug(company) : undefined,
      };

      // Add applicant information if available
      if (applicantInfo && applicantInfo.count > 0) {
        jobData.applicantCount = applicantInfo.count;
        jobData.competitionLevel = applicantInfo.competitionLevel;
      }

      // Always include salary structure, even if empty
      let salaryFound = false;
      
      // Extract salary if available in structured data
      if (jsonLd.baseSalary || jsonLd.salary) {
        const salaryData = jsonLd.baseSalary || jsonLd.salary;
        let minValue = salaryData.value?.minValue || salaryData.minValue;
        let maxValue = salaryData.value?.maxValue || salaryData.maxValue;
        let currency = salaryData.currency || 'USD';
        
        // Handle number values by converting to formatted strings
        if (typeof minValue === 'number') {
          minValue = `$${minValue.toLocaleString()}`;
        }
        if (typeof maxValue === 'number') {
          maxValue = `$${maxValue.toLocaleString()}`;
        }
        
        if (minValue || maxValue) {
          jobData.salary = {
            min: minValue || '',
            max: maxValue || '',
            currency: currency,
          };
          salaryFound = true;
        }
      }
      
      if (!salaryFound) {
        // Fallback: try to extract salary from description text
        const salaryFromDescription = this.extractSalaryFromText(jobData.description);
        if (salaryFromDescription) {
          jobData.salary = salaryFromDescription;
          salaryFound = true;
        }
      }
      
      // Note: salary structure already initialized above

      // Validate required fields
      if (!jobData.title || !jobData.company || !jobData.location || !jobData.description) {
        throw new Error('Missing required fields in structured data');
      }

      return jobData;
    } catch (error) {
      throw new Error(`Failed to parse structured data: ${error instanceof Error ? error.message : 'Unknown parsing error'}`);
    }
  }

  private extractLocation(jobLocation: any): string {
    if (!jobLocation) return '';
    
    if (typeof jobLocation === 'string') return jobLocation;
    
    // Handle array of locations (common in Ashby)
    if (Array.isArray(jobLocation)) {
      const locations = jobLocation.map(loc => {
        if (loc.address) {
          const address = loc.address;
          if (address.addressLocality && address.addressRegion) {
            return `${address.addressLocality}, ${address.addressRegion}`;
          }
          if (address.addressLocality) {
            return address.addressLocality;
          }
          if (address.addressRegion && address.addressCountry) {
            return `${address.addressRegion}, ${address.addressCountry}`;
          }
          if (address.addressCountry) {
            return address.addressCountry;
          }
        }
        return loc.name || '';
      }).filter(loc => loc);
      
      // Join multiple locations with " or "
      return locations.length > 0 ? locations.join(' or ') : '';
    }
    
    // Handle single location object
    if (jobLocation.address) {
      const address = jobLocation.address;
      if (address.addressLocality && address.addressRegion) {
        return `${address.addressLocality}, ${address.addressRegion}`;
      }
      if (address.addressLocality) {
        return address.addressLocality;
      }
      if (address.addressRegion && address.addressCountry) {
        return `${address.addressRegion}, ${address.addressCountry}`;
      }
      if (address.addressCountry) {
        return address.addressCountry;
      }
    }
    
    return jobLocation.name || '';
  }

  private extractSalaryFromText(description: string): { min: string; max: string; currency: string } | null {
    if (!description) return null;

    // Enhanced patterns to match various salary formats
    const salaryRangePatterns = [
      // Explicit range labels with various separators
      /(?:Hiring Range|Salary Range|Base Salary Range|Total Compensation|Range|Compensation|Pay Range):\s*\$?([\d,]+)k?\s*(?:-|\u2013|\u2014|to|and)\s*\$?([\d,]+)k?/i,
      
      // Dollar amounts with K/k suffix (e.g., "$150k - $200k", "150K-200K")
      /\$?([\d,]+)k\s*(?:-|\u2013|\u2014|to|and)\s*\$?([\d,]+)k/i,
      
      // Standard dollar ranges (e.g., "$150,000 - $200,000")
      /\$?([\d,]+)(?:\s*-\s*|\s*\u2013\s*|\s*\u2014\s*|\s+to\s+|\s+and\s+)\$?([\d,]+)(?:\s+(?:USD|per year|annually|yearly|\/year))?/i,
      
      // Between/from patterns
      /(?:between|from)\s+\$?([\d,]+)k?\s*(?:-|\u2013|\u2014|to|and)\s*\$?([\d,]+)k?/i,
      
      // Up to patterns (treat as max only, use 80% as min estimate)
      /(?:up to|maximum of|max)\s+\$?([\d,]+)k?/i,
      
      // Starting from patterns (treat as min only, add 30% as max estimate)
      /(?:starting|from|minimum|min)\s+\$?([\d,]+)k?/i
    ];

    // Single salary patterns
    const singleSalaryPatterns = [
      // Explicit single salary labels
      /(?:Salary|Base Salary|Compensation|Pay|Annual Salary):\s*\$?([\d,]+)k?/i,
      
      // Dollar amounts with context indicators
      /\$?([\d,]+)k?\s+(?:USD|per year|annually|yearly|\/year|annual)/i,
      
      // Standalone dollar amounts (be more restrictive to avoid false positives)
      /(?:^|\s)\$?([\d,]+)k?(?:\s|$)(?=.*(?:salary|pay|compensation|annual))/i
    ];

    // Try salary range patterns first
    for (const pattern of salaryRangePatterns) {
      const match = description.match(pattern);
      if (match && match[1] && match[2]) {
        let min = this.normalizeSalaryAmount(match[1]);
        let max = this.normalizeSalaryAmount(match[2]);
        
        // Ensure min <= max (swap if necessary)
        if (min > max) {
          [min, max] = [max, min];
        }
        
        return {
          min: `$${min.toLocaleString()}`,
          max: `$${max.toLocaleString()}`,
          currency: 'USD'
        };
      }
      
      // Handle "up to" patterns (only one capture group)
      if (match && match[1] && !match[2] && /up to|maximum|max/i.test(pattern.source)) {
        const maxAmount = this.normalizeSalaryAmount(match[1]);
        const minAmount = Math.round(maxAmount * 0.8); // Estimate min as 80% of max
        
        return {
          min: `$${minAmount.toLocaleString()}`,
          max: `$${maxAmount.toLocaleString()}`,
          currency: 'USD'
        };
      }
      
      // Handle "starting from" patterns (only one capture group)
      if (match && match[1] && !match[2] && /starting|from|minimum|min/i.test(pattern.source)) {
        const minAmount = this.normalizeSalaryAmount(match[1]);
        const maxAmount = Math.round(minAmount * 1.3); // Estimate max as 130% of min
        
        return {
          min: `$${minAmount.toLocaleString()}`,
          max: `$${maxAmount.toLocaleString()}`,
          currency: 'USD'
        };
      }
    }

    // Try single salary patterns
    for (const pattern of singleSalaryPatterns) {
      const match = description.match(pattern);
      if (match && match[1]) {
        const amount = this.normalizeSalaryAmount(match[1]);
        const salary = `$${amount.toLocaleString()}`;
        return {
          min: salary,
          max: salary,
          currency: 'USD'
        };
      }
    }

    return null;
  }

  private normalizeSalaryAmount(salaryStr: string): number {
    // Remove commas and whitespace
    const cleaned = salaryStr.replace(/[,\s]/g, '');
    
    // Check if it ends with 'k' or 'K' (thousands)
    if (/k$/i.test(cleaned)) {
      const num = parseFloat(cleaned.replace(/k$/i, ''));
      return Math.round(num * 1000);
    }
    
    // Regular number
    return parseInt(cleaned, 10);
  }

  private parseJobData(response: string, applicantInfo?: { count: number; competitionLevel: 'low' | 'medium' | 'high' | 'extreme' }): JobListing {
    try {
      // Clean the response to extract JSON - try multiple approaches
      let jsonStr = '';
      
      // Approach 1: Look for complete JSON object with balanced braces
      const braceMatch = this.extractBalancedJson(response);
      if (braceMatch) {
        jsonStr = braceMatch;
      } else {
        // Approach 2: Try to fix incomplete JSON by finding opening brace and attempting repair
        const openBraceIndex = response.indexOf('{');
        if (openBraceIndex !== -1) {
          let jsonPart = response.substring(openBraceIndex);
          
          // If JSON appears truncated (no closing brace), try to complete it
          if (!jsonPart.includes('}')) {
            // Add missing closing braces for common truncation patterns
            const fieldCount = (jsonPart.match(/"/g) || []).length / 2; // Rough estimate of field count
            if (fieldCount >= 4) { // If we have at least 2 complete fields
              jsonPart += '"}'; // Close the last field and object
            }
          }
          
          jsonStr = jsonPart;
        } else {
          // Approach 3: Look for JSON between ```json blocks
          const codeBlockMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
          if (codeBlockMatch) {
            jsonStr = codeBlockMatch[1];
          } else {
            console.log('🔍 LLM Response for debugging:', response.substring(0, 800));
            throw new Error('No JSON found in response');
          }
        }
      }

      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (parseError) {
        // If JSON parsing fails, try to extract partial data
        console.log('⚠️  JSON parsing failed, attempting partial extraction...');
        console.log('📄 Raw JSON string:', jsonStr.substring(0, 300));
        
        // Try to extract at least title, company, location from partial JSON
        const partialData = this.extractPartialJobData(jsonStr);
        if (partialData) {
          parsed = partialData;
        } else {
          throw parseError;
        }
      }

      // Validate required fields
      if (!parsed.title || !parsed.company || !parsed.location) {
        throw new Error('Missing required fields in extracted data');
      }

      // Ensure description exists, even if partial
      if (!parsed.description) {
        parsed.description = 'Job description not fully extracted due to response truncation.';
      }

      // Add applicant information if available
      if (applicantInfo && applicantInfo.count > 0) {
        parsed.applicantCount = applicantInfo.count;
        parsed.competitionLevel = applicantInfo.competitionLevel;
      }

      // Ensure salary structure always exists, even if empty
      if (!parsed.salary) {
        parsed.salary = {
          min: '',
          max: '',
          currency: 'USD'
        };
      }
      
      // If salary is empty or missing, try to extract from description as fallback
      if (parsed.salary && (!parsed.salary.min || parsed.salary.min === '') && (!parsed.salary.max || parsed.salary.max === '')) {
        if (parsed.description) {
          const salaryFromDescription = this.extractSalaryFromText(parsed.description);
          if (salaryFromDescription) {
            parsed.salary = salaryFromDescription;
          }
        }
      }

      // Add LinkedIn company slug if not present
      if (!parsed.linkedInCompany && parsed.company) {
        parsed.linkedInCompany = this.convertToLinkedInSlug(parsed.company);
      }

      return parsed as JobListing;
    } catch (error) {
      throw new Error(`Failed to parse job data: ${error instanceof Error ? error.message : 'Unknown parsing error'}`);
    }
  }

  private extractBalancedJson(text: string): string | null {
    // Find the first opening brace
    const startIndex = text.indexOf('{');
    if (startIndex === -1) return null;

    let braceCount = 0;
    let inString = false;
    let escaped = false;

    for (let i = startIndex; i < text.length; i++) {
      const char = text[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\' && inString) {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            // Found the closing brace
            return text.substring(startIndex, i + 1);
          }
        }
      }
    }

    return null; // No balanced JSON found
  }

  private extractPartialJobData(jsonStr: string): JobListing | null {
    try {
      // Try to extract key fields using regex patterns even from broken JSON
      const titleMatch = jsonStr.match(/"title"\s*:\s*"([^"]+)"/);
      const companyMatch = jsonStr.match(/"company"\s*:\s*"([^"]+)"/);
      const locationMatch = jsonStr.match(/"location"\s*:\s*"([^"]+)"/);
      const descriptionMatch = jsonStr.match(/"description"\s*:\s*"([^"]*)/);

      if (titleMatch && companyMatch && locationMatch) {
        return {
          title: titleMatch[1],
          company: companyMatch[1],
          location: locationMatch[1],
          description: descriptionMatch ? descriptionMatch[1] : 'Description truncated due to response limit.',
          salary: {
            min: '',
            max: '',
            currency: 'USD'
          }
        };
      }
    } catch (error) {
      console.warn('Failed to extract partial job data:', error);
    }
    
    return null;
  }

  async extractRequiredTerms(description: string): Promise<string[]> {
    try {
      const prompt = `Analyze the following job description and extract 10-15 key terms and phrases that are essential requirements for this role. Focus on:
- Technical skills and technologies
- Programming languages and frameworks
- Tools and platforms
- Methodologies and practices
- Certifications or specific knowledge areas
- Years of experience requirements
- Key responsibilities that are critical

Return ONLY a JSON array of strings, with each string being a key term or phrase. Be specific and avoid generic terms.

Job Description:
${description}

Response format: ["term1", "term2", "term3", ...]`;

      const response = await this.makeOpenAIRequest(prompt);
      
      // Extract JSON array from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in response');
      }

      const terms = JSON.parse(jsonMatch[0]);
      
      // Validate and limit to 15 terms
      if (!Array.isArray(terms)) {
        throw new Error('Response is not an array');
      }
      
      return terms.slice(0, 15).map(term => String(term).trim());
    } catch (error) {
      console.warn('Failed to extract required terms:', error instanceof Error ? error.message : 'Unknown error');
      return []; // Return empty array as fallback
    }
  }

  async upsertJobIndex(jobId: string, jdFileName: string, requiredTerms: string[]): Promise<void> {
    const indexPath = path.join(process.cwd(), 'data', 'index.jsonl');
    
    try {
      // Read existing index entries
      const existingEntries: any[] = [];
      let foundExisting = false;

      if (fs.existsSync(indexPath)) {
        const content = fs.readFileSync(indexPath, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            if (entry.job_id === jobId) {
              // Update existing entry
              entry.jd_file = jdFileName;
              entry.required_terms = requiredTerms;
              entry.updated_at = new Date().toISOString();
              foundExisting = true;
            }
            existingEntries.push(entry);
          } catch (parseError) {
            console.warn('Skipping invalid JSONL line:', line);
          }
        }
      }

      // Add new entry if not found
      if (!foundExisting) {
        existingEntries.push({
          job_id: jobId,
          jd_file: jdFileName,
          required_terms: requiredTerms,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }

      // Write back to file
      const newContent = existingEntries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
      fs.writeFileSync(indexPath, newContent, 'utf-8');
      
    } catch (error) {
      throw new Error(`Failed to update job index: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async processJobDescription(jobId: string, description: string): Promise<void> {
    try {
      // Extract required terms
      console.log('🔍 Extracting required terms...');
      const requiredTerms = await this.extractRequiredTerms(description);
      
      if (requiredTerms.length === 0) {
        console.log('⚠️  No required terms extracted, proceeding without terms');
      } else {
        console.log(`📝 Extracted ${requiredTerms.length} required terms`);
      }

      // Create data directory if it doesn't exist
      const dataDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Save job description to txt file
      const jdFileName = `jd_${jobId}.txt`;
      const txtFilePath = path.join(dataDir, jdFileName);
      fs.writeFileSync(txtFilePath, description, 'utf-8');

      // Update index
      await this.upsertJobIndex(jobId, jdFileName, requiredTerms);
      
      console.log(`📄 Job description saved to: ${txtFilePath}`);
      console.log(`📋 Index updated in: ${path.join(dataDir, 'index.jsonl')}`);
      
    } catch (error) {
      throw new Error(`Failed to process job description: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async extractForEval(): Promise<{ processed: number; errors: number; skipped: number }> {
    const logsDir = path.join(process.cwd(), 'logs');
    const results = { processed: 0, errors: 0, skipped: 0 };

    try {
      // Check if logs directory exists
      if (!fs.existsSync(logsDir)) {
        console.log('📁 No logs directory found - no jobs to process');
        return results;
      }

      // Get all job subdirectories
      const entries = fs.readdirSync(logsDir, { withFileTypes: true });
      const jobIds = entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort();

      if (jobIds.length === 0) {
        console.log('📁 No job directories found in logs');
        return results;
      }

      console.log(`🔄 Processing ${jobIds.length} job directories...`);
      console.log('');

      for (let i = 0; i < jobIds.length; i++) {
        const jobId = jobIds[i];
        const jobDir = path.join(logsDir, jobId);
        
        console.log(`📊 [${i + 1}/${jobIds.length}] Processing job ${jobId}...`);

        try {
          // Find the most recent job JSON file
          const files = fs.readdirSync(jobDir);
          const jobFiles = files
            .filter(file => file.startsWith('job-') && file.endsWith('.json'))
            .sort()
            .reverse(); // Most recent first

          if (jobFiles.length === 0) {
            console.log(`   ⚠️  No job JSON files found - skipping`);
            results.skipped++;
            continue;
          }

          const jobFilePath = path.join(jobDir, jobFiles[0]);
          
          // Read and parse the job JSON file
          const jobDataRaw = fs.readFileSync(jobFilePath, 'utf-8');
          const jobData = JSON.parse(jobDataRaw);

          if (!jobData.description) {
            console.log(`   ⚠️  No description field found - skipping`);
            results.skipped++;
            continue;
          }

          // Check if txt file already exists to avoid reprocessing
          const dataDir = path.join(process.cwd(), 'data');
          const txtFileName = `jd_${jobId}.txt`;
          const txtFilePath = path.join(dataDir, txtFileName);
          
          if (fs.existsSync(txtFilePath)) {
            // Check if description has changed by comparing content
            const existingContent = fs.readFileSync(txtFilePath, 'utf-8');
            if (existingContent.trim() === jobData.description.trim()) {
              console.log(`   ✅ Already processed (content unchanged) - skipping`);
              results.skipped++;
              continue;
            }
          }

          // Process the job description
          await this.processJobDescription(jobId, jobData.description);
          console.log(`   ✅ Processed successfully`);
          results.processed++;

          // Small delay to avoid overwhelming the API
          if (i < jobIds.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

        } catch (error) {
          console.log(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          results.errors++;
        }
      }

      return results;
    } catch (error) {
      throw new Error(`Failed to extract for eval: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async createJob(company?: string, title?: string, blurbPath?: string, companyUrl?: string): Promise<{ jobId: string; filePath: string }> {
    try {
      // Generate unique job ID
      const jobId = this.generateJobId();
      
      // Create logs directory structure
      const logsDir = path.join(process.cwd(), 'logs');
      const jobDir = path.join(logsDir, jobId);
      
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      
      if (!fs.existsSync(jobDir)) {
        fs.mkdirSync(jobDir, { recursive: true });
      }

      let jobDescription = "";
      
      // If both blurb and URL are provided, synthesize job description
      if (blurbPath && companyUrl) {
        try {
          console.log(`📄 Reading blurb from: ${blurbPath}`);
          console.log(`🌐 Gathering company info from: ${companyUrl}`);
          
          jobDescription = await this.synthesizeJobDescription(blurbPath, companyUrl);
          console.log(`✅ Job description synthesized successfully`);
        } catch (error) {
          console.log(`⚠️  Failed to synthesize job description: ${error instanceof Error ? error.message : 'Unknown error'}`);
          console.log(`   Proceeding with empty description that can be filled manually`);
        }
      }

      // Create empty job JSON template
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `job-${timestamp}.json`;
      const filePath = path.join(jobDir, fileName);
      
      const emptyJobData = {
        title: title || "",
        company: company || "",
        location: "",
        description: jobDescription,
        source: "manual",
        salary: {
          min: "",
          max: "",
          currency: "USD"
        }
      };

      fs.writeFileSync(filePath, JSON.stringify(emptyJobData, null, 2), 'utf-8');
      
      console.log(`📁 Created job directory: logs/${jobId}`);
      console.log(`📄 Created empty job file: ${fileName}`);
      
      console.log(`📝 Next steps:`);
      console.log(`1. Edit the JSON file to add any missing job details`);
      console.log(`2. Run: npm run dev extract-description ${jobId}`);
      console.log(`3. Run: npm run dev score ${jobId}`);
      console.log(`💡 To add to Teal: Use the Chrome extension's Track button`);
      
      return { jobId, filePath };
    } catch (error) {
      throw new Error(`Failed to create job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private generateJobId(): string {
    // Generate unique 8-character hex ID using timestamp + random
    const timestamp = Date.now().toString(16);
    const random = Math.random().toString(16).substring(2, 6);
    const combined = timestamp + random;
    return combined.substring(combined.length - 8);
  }

  private convertToLinkedInSlug(company: string): string {
    return company
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  private async synthesizeJobDescription(blurbPath: string, companyUrl: string): Promise<string> {
    try {
      // Read blurb file
      const blurbContent = fs.readFileSync(path.resolve(blurbPath), 'utf-8').trim();
      if (!blurbContent) {
        throw new Error('Blurb file is empty');
      }
      
      // Gather company information from URL
      const companyInfo = await this.gatherCompanyInfo(companyUrl);
      
      // Create synthesis prompt
      const prompt = this.createJobDescriptionSynthesisPrompt(blurbContent, companyInfo);
      
      // Get LLM response
      const synthesizedDescription = await this.makeOpenAIRequest(prompt, 3000);
      
      return synthesizedDescription.trim();
    } catch (error) {
      throw new Error(`Failed to synthesize job description: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  private async gatherCompanyInfo(companyUrl: string): Promise<string> {
    try {
      const { WebScraper } = require('../utils/web-scraper');
      const html = await WebScraper.fetchHtml(companyUrl);
      const simplifiedHtml = WebScraper.simplifyHtml(html);
      
      // Extract key company information using LLM
      const prompt = `Extract key company information from the following HTML content. Focus on:
- Company mission, values, and culture
- Products, services, and business model
- Company size, stage, and market position
- Recent news, achievements, or initiatives
- Work environment and company benefits

Provide a concise summary that would be useful for creating a targeted job description.

HTML Content:
${simplifiedHtml.slice(0, 8000)}...`;
      
      const companyInfo = await this.makeOpenAIRequest(prompt, 2000);
      return companyInfo.trim();
    } catch (error) {
      throw new Error(`Failed to gather company info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  private createJobDescriptionSynthesisPrompt(blurb: string, companyInfo: string): string {
    return `Create a comprehensive job description by combining the provided job blurb with company information.

Job Blurb:
${blurb}

Company Information:
${companyInfo}

Instructions:
- Use the job blurb as the foundation for the role requirements and responsibilities
- Incorporate relevant company information to make the description more specific and appealing
- Maintain the core job requirements from the blurb
- Add company-specific context, culture, and benefits where appropriate
- Ensure the tone matches professional job posting standards
- Make the description comprehensive but not overly long
- Focus on what would attract qualified candidates

Return only the synthesized job description text, no additional formatting or commentary.`;
  }

  private async extractJobDataFromHtml(html: string, applicantInfo?: { count: number; competitionLevel: 'low' | 'medium' | 'high' | 'extreme' }): Promise<JobListing> {
    // First, try to extract structured data (JSON-LD)
    const structuredData = WebScraper.extractStructuredData(html);
    
    if (structuredData) {
      console.log('🎯 Using structured data (JSON-LD)');
      try {
        return this.parseStructuredData(structuredData, applicantInfo);
      } catch (error) {
        console.log('⚠️  Structured data parsing failed:', error instanceof Error ? error.message : 'Unknown error');
        console.log('📄 Falling back to HTML scraping');
      }
    } else {
      // Fallback to HTML scraping if no structured data
      console.log('📄 Falling back to HTML scraping');
    }
    
    // HTML scraping fallback logic
    const simplifiedHtml = WebScraper.simplifyHtml(html);

    // Create prompt for LLM
    const prompt = this.createExtractionPrompt(simplifiedHtml);

    // Get LLM response with higher token limit for job extraction
    const response = await this.makeOpenAIRequest(prompt, 4000);

    // Parse JSON response
    return this.parseJobData(response, applicantInfo);
  }

  /**
   * Create a parent reminder with subtasks for the tracked job using macOS Reminders
   */
  private async createJobReminder(jobData: JobListing, jobId: string, sourceUrl?: string, reminderPriority?: number, selectedReminders?: string[]): Promise<void> {
    try {
      console.log(`📋 Attempting to create reminders for job ${jobId}...`);
      console.log(`   Selected reminders: ${selectedReminders ? selectedReminders.join(', ') : 'all'}`);

      // Dynamically import the MacOSReminderService to make it optional
      // @ts-ignore - Optional dependency, may not be available
      const { MacOSReminderService } = await import('@inkredabull/macos-reminder');

      const reminderService = new MacOSReminderService();

      // Load config to get default settings
      const config = reminderService.getConfig();

      const today = new Date().toISOString().split('T')[0]; // Today's date in YYYY-MM-DD format
      const threeDaysFromToday = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Three days from today in YYYY-MM-DD format
      const jobTitle = `${jobData.title || 'Unknown Position'} at ${jobData.company || 'Unknown Company'}`;

      // Common tags for all reminders - include job ID
      const commonTags = config.tags ? config.tags.split(',').map((t: string) => t.trim()) : ['#applying'];
      commonTags.push(`#${jobId}`); // Tag all reminders with job ID

      // Reminder 1: Main tracking reminder
      const trackingReminder = {
        title: jobTitle,
        notes: `Job Application Tracking

Position: ${jobData.title || 'Unknown Position'}
Company: ${jobData.company || 'Unknown Company'}
Location: ${jobData.location || 'Unknown Location'}
URL: ${sourceUrl || 'No URL provided'}
Job ID: ${jobId}

Extracted via job-extractor

Next steps:
- Check application status
- Send follow-up email if needed
- Research company updates
- Prepare for potential interview`,
        list: config.list_name,
        priority: reminderPriority || config.default_priority,
        tags: commonTags,
        dueDate: today,
        dueTime: config.due_date?.time || '23:59'
      };

      // Reminder 2: "Apply for" action reminder
      const applyReminder = {
        title: `Apply for ${jobTitle}`,
        notes: `Submit application for this position

Position: ${jobData.title || 'Unknown Position'}
Company: ${jobData.company || 'Unknown Company'}
URL: ${sourceUrl || 'No URL provided'}
Job ID: ${jobId}

Action required: Complete and submit application`,
        list: config.list_name,
        priority: reminderPriority || config.default_priority,
        tags: commonTags,
        dueDate: today,
        dueTime: '09:00' // Morning reminder
      };

      // Reminder 3: "Ping" follow-up reminder
      const pingReminder = {
        title: `Ping about ${jobTitle}`,
        notes: `Follow up on application status

Position: ${jobData.title || 'Unknown Position'}
Company: ${jobData.company || 'Unknown Company'}
Job ID: ${jobId}

Suggested actions:
- Check application portal for updates
- Send follow-up email to recruiter
- Connect with employees on LinkedIn`,
        list: config.list_name,
        priority: reminderPriority || config.default_priority,
        tags: commonTags,
        dueDate: today,
        dueTime: '17:00' // Afternoon reminder
      };

      // Reminder 4: "Prep for" interview preparation reminder
      const prepReminder = {
        title: `Prep for ${jobTitle}`,
        notes: `Prepare for interview

Position: ${jobData.title || 'Unknown Position'}
Company: ${jobData.company || 'Unknown Company'}
Job ID: ${jobId}

Preparation tasks:
- Research company background and recent news
- Review job description and requirements
- Prepare answers to common interview questions
- Prepare questions to ask the interviewer
- Review your resume and relevant experiences`,
        list: config.list_name,
        priority: reminderPriority || config.default_priority,
        tags: commonTags,
        dueDate: today,
        dueTime: '10:00' // Morning reminder
      };

      // Reminder 5: "Follow-up / further outreach" networking reminder
      const followUpReminder = {
        title: `Follow-up / further outreach for: ${jobData.title || 'Unknown Position'} @ ${jobData.company || 'Unknown Company'}`,
        notes: `Additional networking and outreach

Position: ${jobData.title || 'Unknown Position'}
Company: ${jobData.company || 'Unknown Company'}
Job ID: ${jobId}

Outreach activities:
- Connect with hiring manager on LinkedIn
- Reach out to employees in similar roles
- Engage with company content on social media
- Send thank you notes after interviews
- Follow up on pending responses`,
        list: config.list_name,
        priority: reminderPriority || config.default_priority,
        tags: commonTags,
        dueDate: threeDaysFromToday,
        dueTime: '14:00', // Early afternoon reminder
        url: `https://mail.google.com/mail/u/0/#search/in%3Asent+from%3Ame+subject%3A${encodeURIComponent(jobData.company || 'Unknown Company')}`
      };

      // Create all reminders as separate top-level reminders
      // Filter based on selectedReminders if provided
      const allReminders = {
        track: trackingReminder,
        apply: applyReminder,
        ping: pingReminder,
        prep: prepReminder,
        followup: followUpReminder
      };

      let remindersToCreate: any[] = [];
      if (selectedReminders && selectedReminders.length > 0) {
        // Create only selected reminders
        selectedReminders.forEach(type => {
          if (allReminders[type as keyof typeof allReminders]) {
            remindersToCreate.push(allReminders[type as keyof typeof allReminders]);
          }
        });
        console.log(`📋 Creating ${remindersToCreate.length} selected reminder(s): ${selectedReminders.join(', ')}`);
      } else {
        // Sheet insertion now handles tracking; create only action reminders by default
        remindersToCreate = [applyReminder, pingReminder, prepReminder, followUpReminder];
      }

      if (remindersToCreate.length === 0) {
        console.log('📋 No reminders selected to create');
        return;
      }

      const results = await Promise.all(remindersToCreate.map(r => reminderService.createReminder(r)));

      const successCount = results.filter(r => r.success).length;
      if (successCount > 0) {
        console.log(`✅ Created ${successCount} reminders for ${jobTitle}, all tagged with #${jobId}`);
        remindersToCreate.forEach((reminder, idx) => {
          if (results[idx].success) {
            console.log(`   • ${reminder.title}`);
          }
        });
      }

      const failedCount = results.filter(r => !r.success).length;
      if (failedCount > 0) {
        console.warn(`⚠️  Failed to create ${failedCount} reminder(s)`);
      }
    } catch (error) {
      // Don't fail the entire extraction if reminder creation fails
      // But DO log the error so users know why reminders weren't created
      if (error instanceof Error && error.message.includes('Cannot find module')) {
        console.warn('⚠️  macOS Reminder package not found or not built - skipping reminder creation');
        console.warn('   To enable reminders:');
        console.warn('   1. cd ../macos-reminder && npm install && npm run build');
        console.warn('   2. Or install from npm: npm install @inkredabull/macos-reminder');
        return;
      }
      console.warn('⚠️  Failed to create job reminders:', error instanceof Error ? error.message : 'Unknown error');
      if (error instanceof Error && error.stack) {
        console.warn('   Stack trace:', error.stack.split('\n').slice(0, 3).join('\n'));
      }
    }
  }

  /**
   * Run post-extraction workflow: score job, generate resume if score is good, run critique
   */
  private async runPostExtractionWorkflow(jobId: string, jobData: JobListing): Promise<void> {
    try {
      // Load workflow configuration
      const workflowConfig = this.loadWorkflowConfig();
      
      if (!workflowConfig.enabled) {
        console.log('⚠️  Auto workflow disabled in configuration');
        return;
      }

      console.log(`\n🚀 Starting post-extraction workflow for ${jobId}...`);
      
      // Step 1: Score the job
      if (workflowConfig.steps.score) {
        console.log('📊 Step 1: Scoring job...');
        const score = await this.scoreJob(jobId, workflowConfig.files.criteria_file);
        
        if (!score) {
          console.log('❌ Job scoring failed, skipping resume generation');
          return;
        }

        console.log(`✅ Job scored: ${score.overallScore}%`);

        // Log to Google Sheets after scoring
        const sheetsLogger = createSheetsLogger();
        if (sheetsLogger) {
          await sheetsLogger.logJobAnalysis(jobId, jobData, score, jobData.url || '', {
            threshold: workflowConfig.score_threshold,
            origin: 'CLI',
          });
        }

        // Step 2: Generate resume if score is above threshold
        if (workflowConfig.steps.resume && score.overallScore >= workflowConfig.score_threshold) {
          console.log(`📄 Step 2: Generating resume (score ${score.overallScore}% >= ${workflowConfig.score_threshold}%)...`);

          const resumeResult = await this.generateResume(jobId, workflowConfig);

          if (resumeResult) {
            console.log('✅ Resume generated successfully');
            
            // Step 3: Critique is automatically handled by ResumeCreatorAgent
            if (workflowConfig.steps.critique) {
              console.log('🔍 Step 3: Critique automatically performed by ResumeCreatorAgent');
            }
          } else {
            console.log('❌ Resume generation failed');
          }
        } else if (workflowConfig.steps.resume) {
          console.log(`📄 Skipping resume generation (score ${score.overallScore}% < ${workflowConfig.score_threshold}%)`);
        } else {
          console.log('📄 Resume generation disabled in configuration');
        }
      } else {
        console.log('📊 Job scoring disabled in configuration');
      }

      console.log(`✅ Post-extraction workflow completed for ${jobId}`);
      
    } catch (error) {
      // Don't fail the entire extraction if workflow fails
      console.warn('⚠️  Post-extraction workflow failed:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Load workflow configuration
   */
  private loadWorkflowConfig(): any {
    const configPath = 'auto-workflow-config.yaml';
    const examplePath = 'auto-workflow-config.yaml.example';
    
    try {
      let configFile = configPath;
      if (!fs.existsSync(configPath)) {
        if (fs.existsSync(examplePath)) {
          console.log(`⚠️  Config file not found at ${configPath}, using example file`);
          configFile = examplePath;
        } else {
          // Return default config
          return {
            enabled: true,
            score_threshold: 70,
            resume_mode: 'leader',
            max_roles: 4,
            generate_job_description: false,
            files: {
              criteria_file: 'criteria.json',
              cv_file: 'cv.txt'
            },
            steps: {
              score: true,
              resume: true,
              critique: true
            }
          };
        }
      }

      const configContent = fs.readFileSync(configFile, 'utf8');
      const configData = yaml.load(configContent) as { workflow_config: any };
      return configData.workflow_config;
    } catch (error) {
      console.warn('⚠️  Failed to load workflow config, using defaults');
      return {
        enabled: true,
        score_threshold: 70,
        resume_mode: 'leader',
        max_roles: 4,
        generate_job_description: false,
        files: {
          criteria_file: 'criteria.json',
          cv_file: 'cv.txt'
        },
        steps: {
          score: true,
          resume: true,
          critique: true
        }
      };
    }
  }

  /**
   * Score a job using JobScorerAgent
   */
  private async scoreJob(jobId: string, criteriaFile?: string): Promise<any> {
    try {
      // Use provided criteria file or find default
      const criteriaPath = criteriaFile || this.findCriteriaFile();
      
      const scorer = new JobScorerAgent(
        {
          openaiApiKey: this.config.openaiApiKey,
          model: this.config.model,
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens
        },
        criteriaPath
      );
      
      const score = await scorer.scoreJob(jobId);
      return score;
    } catch (error) {
      console.error('❌ Job scoring error:', error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }

  /**
   * Generate resume using ResumeCreatorAgent
   */
  private async generateResume(jobId: string, workflowConfig: any): Promise<boolean> {
    try {
      // Find CV file using config or fallback
      const cvFile = await this.findCvFileWithConfig(workflowConfig.files.cv_file);
      
      if (!cvFile) {
        console.log('❌ No CV file found, skipping resume generation');
        return false;
      }

      console.log(`📋 Using CV file: ${cvFile}`);
      
      // Use Anthropic API key if available, fallback to OpenAI
      const anthropicApiKey = process.env.ANTHROPIC_API_KEY || this.config.openaiApiKey;

      // Create provider configs for resume creator
      const providerConfig: LLMProviderConfig = {
        provider: 'anthropic',
        apiKey: anthropicApiKey,
        model: 'claude-sonnet-4-5-20250929',
        maxTokens: this.config.maxTokens,
        temperature: 0.3
      };

      const resumeCreator = new ResumeCreatorAgent(
        providerConfig,
        providerConfig,
        workflowConfig.max_roles || 4,
        workflowConfig.resume_mode || 'leader'
      );
      
      const result = await resumeCreator.createResume(
        jobId,
        cvFile,
        undefined, // outputPath
        false, // regenerate
        workflowConfig.generate_job_description || false,
        false, // critique - disabled for programmatic workflow
        'programmatic' // source
      );
      
      return result.success;
    } catch (error) {
      console.error('❌ Resume generation error:', error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  /**
   * Find criteria file for job scoring
   */
  private findCriteriaFile(): string {
    const possiblePaths = [
      'criteria.json',
      './criteria.json',
      'config/criteria.json'
    ];
    
    for (const criteriaPath of possiblePaths) {
      if (fs.existsSync(criteriaPath)) {
        console.log(`📋 Found criteria file: ${criteriaPath}`);
        return criteriaPath;
      }
    }
    
    console.log('⚠️  No criteria file found, using default criteria.json');
    return 'criteria.json';
  }

  /**
   * Find CV file for resume generation
   */
  private async findCvFile(): Promise<string | null> {
    const possiblePaths = [
      'cv.txt',
      './cv.txt',
      'CV.txt',
      './CV.txt',
      'sample-cv.txt',
      './sample-cv.txt'
    ];
    
    for (const cvPath of possiblePaths) {
      if (fs.existsSync(cvPath)) {
        console.log(`📄 Found CV file: ${cvPath}`);
        return cvPath;
      }
    }
    
    console.log('⚠️  No CV file found');
    return null;
  }

  /**
   * Find CV file with configuration preference
   */
  private async findCvFileWithConfig(preferredPath: string): Promise<string | null> {
    // First try the configured path
    if (preferredPath && fs.existsSync(preferredPath)) {
      console.log(`📄 Found CV file (from config): ${preferredPath}`);
      return preferredPath;
    }
    
    // Fallback to standard search
    return this.findCvFile();
  }

}
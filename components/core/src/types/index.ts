export interface JobListing {
  title: string;
  company: string;
  location: string;
  description: string;
  url?: string; // Job posting URL
  applicantCount?: number;
  competitionLevel?: 'low' | 'medium' | 'high' | 'extreme';
  linkedInCompany?: string; // LinkedIn company slug (e.g., "microsoft", "google")
  salary: {
    min: string;
    max: string;
    currency: string;
  };
}

export interface AgentConfig {
  openaiApiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ExtractorResult {
  success: boolean;
  data?: JobListing;
  error?: string;
  jobId?: string;
  competitionReason?: {
    applicantCount: number;
    threshold: number;
    competitionLevel: 'low' | 'medium' | 'high' | 'extreme';
  };
}

export interface JobCriteria {
  required_skills: string[];
  preferred_skills: string[];
  experience_levels: Record<string, number>;
  salary_range: {
    min: number;
    max: number;
    currency: string;
  };
  locations: string[];
  company_size?: string[];
  job_types?: string[];
  company_requirements?: {
    funding_stage?: string[];
    company_size?: {
      min: number;
      max: number;
      ideal: number;
    };
    team_size?: {
      direct_reports?: {
        min: number;
        max: number;
      };
      org_size?: number;
    };
    financial_metrics?: {
      arr_minimum?: number;
      runway_years?: number;
      revenue_per_employee?: number;
      net_dollar_retention?: number;
      new_logo_growth?: number;
    };
    budget_responsibility?: number;
    domains?: string[];
    example_companies?: string[];
  };
  role_requirements?: {
    leadership_level?: string;
    autonomy?: boolean;
    hands_on?: boolean;
    strategic_involvement?: boolean;
    no_oncall?: boolean;
    report_to_ceo?: boolean;
    proven_executive_team?: boolean;
  };
  cultural_values?: string[];
  deal_breakers?: string[];
  weights: {
    required_skills: number;
    preferred_skills: number;
    experience_level: number;
    salary: number;
    location: number;
    company_match: number;
  };
}

export interface JobScore {
  jobId: string;
  overallScore: number;
  rationale: string;
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
  strategic_analysis: {
    problem_solving: string;      // What problem do they think they're trying to solve?
    hiring_archetype: string;      // What archetype are they probably hiring for?
    differentiation: string;       // Where am I differentiated or even misaligned?
  };
  timestamp: string;
}

export interface CVData {
  personalInfo: {
    name: string;
    email: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
  };
  summary?: string;
  experience: Array<{
    title: string;
    company: string;
    duration: string;
    description: string;
    achievements?: string[];
  }>;
  education: Array<{
    degree: string;
    institution: string;
    year: string;
    details?: string;
  }>;
  skills: {
    technical?: string[];
    languages?: string[];
    certifications?: string[];
  };
  projects?: Array<{
    name: string;
    description: string;
    technologies?: string[];
    url?: string;
  }>;
}

export interface RoleSelection {
  format: 'standard' | 'split';
  rolesIncluded: number;
  reasoning: string;
}

export interface ClassificationResult {
  domain: 'regulated' | 'enterprise' | 'platform' | 'blockchain' | 'general';
  format: 'standard' | 'split';
  rolesIncluded: number;
  reasoning: string;
  domainSignals: string[];
}

export interface ResumeResult {
  success: boolean;
  pdfPath?: string;
  error?: string;
  tailoringChanges?: string[];
  improvedWithCritique?: boolean;
  critiqueRating?: number;
  roleSelection?: RoleSelection;
  totalCost?: number;
}

export interface ResumeCritique {
  success: boolean;
  jobId: string;
  resumePath: string;
  overallRating: number; // 1-10 scale
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  detailedAnalysis: string;
  timestamp: string;
  error?: string;
  cost?: number;
}

export type StatementType = 'cover-letter' | 'endorsement' | 'about-me' | 'general' | 'about-me-hook' | 'about-me-career-snapshot' | 'about-me-focus-story' | 'about-me-themes' | 'about-me-why' | 'about-me-close' | 'about-me-personal-touch';

export interface StatementOptions {
  emphasis?: string;
  companyInfo?: string;
  customInstructions?: string;
  person?: 'first' | 'third';
  companyUrl?: string;
}

export interface StatementResult {
  success: boolean;
  content?: string;
  error?: string;
  type: StatementType;
  characterCount?: number;
}

export interface InterviewPrepResult {
  success: boolean;
  aboutMeContent?: string;
  focusStoryContent?: string;
  companyRubricGenerated?: boolean;
  error?: string;
}

export interface JobTheme {
  name: string;
  definition: string;
  importance: 'high' | 'medium' | 'low';
  examples?: ThemeExample[];
}

export interface ThemeExample {
  text: string;
  source: string; // which part of CV this came from
  impact: string; // quantified impact/result
  isHighlighted?: boolean; // marked as best example for professional impact
}

export interface ThemeExtractionResult {
  success: boolean;
  jobId: string;
  themes?: JobTheme[];
  highlightedExamples?: ThemeExample[];
  interviewStories?: string[];
  error?: string;
  timestamp: string;
}

export interface ProfileConfig {
  location: string;
  role: string;
  minSalary?: number; // Optional - will be read from environment
  preferredStack: string[];
  teamSize: string;
  domains: string[];
  domainOfExcellence: string;
}

export interface ProfileResult {
  success: boolean;
  profile?: string;
  googleScript?: string;
  error?: string;
}

export interface ProjectInfo {
  title: string;
  industry: string;
  projectType: string;
  duration: '0-6 Months' | '6-12 Months' | '12-24 Months' | '24+ Months';
  organizationSize: string;
  function: string;
  location: string;
  problem: string;
  action: string;
  result: string;
}

export interface ProjectExtractionResult {
  success: boolean;
  project?: ProjectInfo;
  formattedOutput?: string;
  error?: string;
}

export interface LinkedInConnection {
  name: string;
  title: string;
  profileUrl: string;
  connectionDegree: '1st' | '2nd';
  mutualConnection?: string; // For 2nd degree connections
  location?: string;
  company: string;
}

export interface OutreachResult {
  success: boolean;
  company?: string;
  companyUrl?: string;
  connections?: LinkedInConnection[];
  totalConnections?: number;
  firstDegreeCount?: number;
  secondDegreeCount?: number;
  error?: string;
  timestamp: string;
}

export interface ApplicationFormField {
  name: string;
  type: string;
  label: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
  maxLength?: number;
  value?: string;
}

export interface ApplicationFormData {
  url: string;
  fields: ApplicationFormField[];
  submitButton?: {
    text: string;
    selector: string;
  };
}

export interface ApplicationResult {
  success: boolean;
  formData?: ApplicationFormData;
  filledFields?: Record<string, string>;
  error?: string;
  readyToSubmit?: boolean;
  instructions?: string;
  submitted?: boolean;
}

export type AboutMeSection = 'hook' | 'career-snapshot' | 'themes' | 'why' | 'focus-story' | 'close' | 'personal-touch';

export interface AboutMeSectionData {
  content: string;
  generatedAt: string;
  lastModified: string;
  version: number;
  metadata?: {
    userTheme?: string;
    [key: string]: any;
  };
}

export interface SectionGenerationResult {
  success: boolean;
  content?: string;
  section?: AboutMeSection;
  error?: string;
}

export interface SectionCritiqueResult {
  success: boolean;
  section?: AboutMeSection;
  rating?: number; // 1-10 scale
  strengths?: string[];
  weaknesses?: string[];
  recommendations?: string[];
  detailedAnalysis?: string;
  error?: string;
}

export interface PDFValidationGuidance {
  maxPages: number; // 1 for one-page requirement
  requiredSections?: string[]; // e.g., ["Summary", "Experience", "Skills"]
  characterLimits?: {
    summary?: { min: number; max: number };
  };
  forbidden?: string[]; // e.g., ["references", "hobbies"]
}

export interface PDFJudgeResult {
  success: boolean;
  passes: boolean;
  pageCount: number;
  violations: string[];
  suggestions: string[];
  confidence: number; // 1-10 scale
  timestamp: string;
  error?: string;
}
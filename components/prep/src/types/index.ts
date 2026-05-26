export type StatementType = 'cover-letter' | 'endorsement' | 'about-me' | 'general' | 'about-me-hook' | 'about-me-career-snapshot' | 'about-me-focus-story' | 'about-me-themes' | 'about-me-why' | 'about-me-close' | 'about-me-personal-touch' | 'about-me-questions';

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
  isHighlighted?: boolean;
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
  minSalary?: number;
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

export type AboutMeSection = 'hook' | 'career-snapshot' | 'themes' | 'why' | 'focus-story' | 'close' | 'personal-touch' | 'questions';

export interface AboutMeSectionData {
  content: string;
  generatedAt: string;
  lastModified: string;
  version: number;
  metadata?: {
    userTheme?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  rating?: number;
  strengths?: string[];
  weaknesses?: string[];
  recommendations?: string[];
  detailedAnalysis?: string;
  error?: string;
}

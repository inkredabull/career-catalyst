// Example configuration for per-subject-line flags
// Copy this pattern to your settings.ts file and customize as needed

export const EXAMPLE_SUBJECT_LINE_FLAGS = {
  // Exact subject line matches
  'Application for Senior Developer': {
    SEND_SMS: true,
    ATTACH_RESUME: true,
  },
  'Follow-up on Interview': {
    SEND_SMS: false,
    ATTACH_RESUME: false,
  },
  
  // Regex pattern matches (surrounded by /.../)
  '/.*Application.*/': {
    SEND_SMS: true,  // Send SMS for all application-related emails
  },
  '/.*Interview.*/': {
    ATTACH_RESUME: true,  // Always attach resume for interview-related emails
  },
  '/.*Warmup.*/': {
    SEND_SMS: false,
    ATTACH_RESUME: false,
  },
  
  // More specific patterns
  '/^Re:.*': {
    SEND_SMS: false,  // Don't send SMS for replies
  },
  '/.*Urgent.*/': {
    SEND_SMS: true,
    ATTACH_RESUME: true,
  },
};

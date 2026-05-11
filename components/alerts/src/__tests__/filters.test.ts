import { titlePassesPatterns } from '../filters';

describe('titlePassesPatterns — include patterns (positive allowlist)', () => {
  const shouldPass = [
    // CTO family
    'CTO',
    'CPTO',
    'Field CTO',
    'Fractional CTO',
    'Chief of Staff to the CTO',
    'Chief Technology Officer',
    'Chief Technical Officer',
    // VP family
    'VP Engineering',
    'VP of Engineering',
    'VP of Product Engineering',
    'Vice President Engineering',
    'Vice President of AI',
    // Head of family
    'Head of Engineering',
    'Head of Engineering Operations',
    'Head of AI Engineering',
    'Head of Technical Strategy',
    'Head of Product and Technology',
    'Head of Platform Engineering',
    // Director family
    'Director of Engineering',
    'Director of Product Engineering',
    'Senior Director of Engineering',
    'Director, Product Engineering',
    // Technical managers
    'Technical Program Manager',
    'Technical Product Manager',
    'AI Product Manager',
    // Engineering roles
    'Solutions Engineer',
    'Solutions Architect',
    'Forward Deployed Engineer',
    'AI Enablement Engineer',
    // Developer Relations
    'Developer Relations',
    // Chief of Staff (standalone)
    'Chief of Staff',
  ];

  test.each(shouldPass)('accepts: %s', title => {
    expect(titlePassesPatterns(title)).toBe(true);
  });
});

describe('titlePassesPatterns — exclude patterns (explicit blocklist)', () => {
  const shouldFail = [
    'Software Engineer',
    'Staff Engineer',
    'Principal Engineer',
    'Security Engineer',
    'Data Engineer',
    'Founding Engineer',
    'Founding Research Engineer',
    'Distinguished Engineer',
    'Executive Director',
    'Director of Research',
    'Head of IT',
  ];

  test.each(shouldFail)('rejects via exclude: %s', title => {
    expect(titlePassesPatterns(title)).toBe(false);
  });
});

describe('titlePassesPatterns — false positives blocked by include allowlist', () => {
  const shouldFail = [
    'Business Development Director - Real world Evidence & HEOR',
    'Business Development Director',
    'Head of People',
    'Head of HR',
    'VP of Sales',
    'VP of Marketing',
    'General Counsel',
    'Account Executive',
    'Regional Sales Manager',
    'Director of Clinical Operations',
    'Chief Medical Officer',
  ];

  test.each(shouldFail)('rejects noise: %s', title => {
    expect(titlePassesPatterns(title)).toBe(false);
  });
});

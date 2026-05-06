export const COMPANIES_TO_EXCLUDE = [
  'Airwallex',
  'Harnham',
  'CyberCoders',
  '80Twenty',
  'Lumicity',
  'Jobot',
  'Recruiting from Scratch',
  'Jobs via eFinancialCareers',
  'Health eCareers',
  'Acceler8 Talent',
  'Storm4',
  'myGwork - LGBTQ+ Business Community',
  'Stealth',
  'Storm6',
  'Dice',
  'Get It Recruit - Information Technology',
  'CryptoRecruit',
  'Crossover',
  'Gusto',
  'Confidential',
  'Jobs via Dice',
  'Rad AI',
  'Stealth Startup',
];

export const COMPANIES: Record<number, string> = {
  1035:     'Microsoft',
  16181286: 'Vercel',
  1441:     'Google',
  3185:     'Salesforce',
  1586:     'Amazon',
  1337:     'LinkedIn',
  807257:   'Asana',
};

export const BAY_AREA_GEO_ID = '90000084';
export const SF_GEO_ID       = '102277331';
export const US_GEO_ID       = '103644278';

export const GEOS: Record<string, string> = {
  [US_GEO_ID]:       'US',
  [BAY_AREA_GEO_ID]: 'SF Bay Area',
  [SF_GEO_ID]:       'San Francisco',
};

export const ONE_WEEK   = 'r604800';
export const ONE_DAY    = 'r86400';
export const EIGHT_HOURS = 'r28800';
export const TIME_FRAME  = EIGHT_HOURS;

export const SF_FILTER = {
  origin: 'JOB_SEARCH_PAGE_JOB_FILTER',
  locationUnion: { geoId: SF_GEO_ID },
  selectedFilters: {
    sortBy:          ['R'],
    distance:        [25],
    experience:      [5, 6],
    populatedPlace:  [SF_GEO_ID],
    salaryBucketV2:  [6],
    timePostedRange: [TIME_FRAME],
    workplaceType:   [1, 2, 3],
  },
  spellCorrectionEnabled: true,
};

export const US_FILTER = {
  origin: 'JOB_SEARCH_PAGE_JOB_FILTER',
  locationUnion: { geoId: US_GEO_ID },
  selectedFilters: {
    sortBy:          ['R'],
    experience:      [5, 6],
    salaryBucketV2:  [6],
    timePostedRange: [TIME_FRAME],
    workplaceType:   [2],
  },
  spellCorrectionEnabled: true,
};

/** Job titles to search — uncomment/add to expand coverage */
export const TITLES = [
  // Engineering leadership
  'Chief of Staff to the CTO',
  'Head of Engineering Operations',
  'VP of Platform Engineering',
  'Chief Technologist',
  'VP of Operations',
  'Head of AI Engineering',
  'Head of Technical Strategy',
  'VP Engineering',
  'Head of Engineering',
  'CTO',
  'Director of Engineering',
  'Founding Engineer',
  'AI Engineer',

  // Program management
  'Technical Program Manager',
  'Forward Deployed Engineer',

  // Product (uncomment to activate)
  // 'VP Product',
  // 'Director of Product Management',
  // 'Technical Product Manager',

  // Solutions / field
  // 'Solutions Engineer',
  // 'Solutions Architect',
  // 'Field CTO',
  // 'Developer Relations',
  // 'Channel Partner Manager',
  // 'Fractional CTO',
  // 'Head of Product and Technology',
  // 'Head of Product and Engineering',
];

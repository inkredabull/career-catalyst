export const COMPANIES: Record<number, string> = {
  1035: "Microsoft",
  16181286: "Vercel",
  1441: "Google",
  3185: "Salesforce",
  1586: "Amazon",
  1337: "LinkedIn",
  807257: "Asana",
};

export const BAY_AREA_GEO_ID = "90000084";
export const SF_GEO_ID = "102277331";
export const US_GEO_ID = "103644278";

export const GEOS: Record<string, string> = {
  [US_GEO_ID]: "US",
  [BAY_AREA_GEO_ID]: "SF Bay Area",
  [SF_GEO_ID]: "San Francisco",
};

export const ONE_WEEK = "r604800";
export const ONE_DAY = "r86400";
export const EIGHT_HOURS = "r28800";
export const TIME_FRAME = ONE_DAY;

export const SF_FILTER = {
  origin: "JOB_SEARCH_PAGE_JOB_FILTER",
  locationUnion: { geoId: SF_GEO_ID },
  selectedFilters: {
    sortBy: ["R"],
    distance: [25],
    experience: [5, 6],
    populatedPlace: [SF_GEO_ID],
    salaryBucketV2: [6],
    timePostedRange: [TIME_FRAME],
    workplaceType: [1, 2, 3],
  },
  spellCorrectionEnabled: true,
};

export const US_FILTER = {
  origin: "JOB_SEARCH_PAGE_JOB_FILTER",
  locationUnion: { geoId: US_GEO_ID },
  selectedFilters: {
    sortBy: ["R"],
    experience: [5, 6],
    salaryBucketV2: [6],
    timePostedRange: [TIME_FRAME],
    workplaceType: [2],
  },
  spellCorrectionEnabled: true,
};

export const STRONG_FIT_MAX_APPLICANTS = 50;
// At or above this applicant count a posting is oversaturated — an application is
// unlikely to be reviewed — so it's forced to a categorical 🔴 Pass regardless of fit.
// Kept in sync with components/scorer's APPLICANT_SATURATION_THRESHOLD.
export const APPLICANT_SATURATION_THRESHOLD = 200;

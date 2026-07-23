/**
 * Configuration constants for the networker CLI.
 * All runtime values come from environment variables via dotenv.
 */

import { ContactPriorityTier } from './types.js';

// ---------------------------------------------------------------------------
// Lifecycle thresholds (from network-followups)
// ---------------------------------------------------------------------------

export const DAYS = {
  /** Withdraw invitations older than this many days */
  WITHDRAWAL_THRESHOLD: 30,
  /** LinkedIn blocks re-inviting for this many days after withdrawal */
  LINKEDIN_COOLDOWN: 21,
} as const;

/** Maximum number of re-invite attempts after initial withdrawal */
export const MAX_ATTEMPTS = 2;

// ---------------------------------------------------------------------------
// Claude / Anthropic
// ---------------------------------------------------------------------------

export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

// ---------------------------------------------------------------------------
// Tracker data file
// ---------------------------------------------------------------------------

export const DEFAULT_TRACKER_FILE = './data/tracker.json';

export function getTrackerFile(): string {
  return process.env.NETWORKER_TRACKER_FILE ?? DEFAULT_TRACKER_FILE;
}

// ---------------------------------------------------------------------------
// Profile tier classification patterns (from meetup-networker profileLookup)
// ---------------------------------------------------------------------------

const DEFAULT_TARGET_PATTERN =
  'Partner|Capital|VC|Investor|C[TEOFMPI]O|Chief\\s+\\w+\\s+Officer|VP|VPE|Director|DIR\\s+ENG';
const DEFAULT_TIER_1_PATTERN =
  'Managing\\s+Partner|General\\s+Partner|\\bPartner\\b|\\bVC\\b|Venture\\s+Capital|\\bInvestor\\b|\\bCapital\\b|C[TEOFMPI]O|Chief\\s+\\w+\\s+Officer';
const DEFAULT_TIER_2_PATTERN =
  'Vice\\s+President|\\bVP\\b|\\bVPE\\b|Head\\s+of|\\bPrincipal\\b|\\bDirector\\b|DIR\\s+ENG|Founder|Co-?Founder';
const DEFAULT_TIER_3_PATTERN = '';

function compilePattern(envVar: string, fallback: string): RegExp | null {
  const raw = (process.env[envVar] ?? fallback).trim();
  return raw ? new RegExp(raw, 'i') : null;
}

export const TIER_PATTERNS = {
  tier1: compilePattern('TARGET_TIER_1_PATTERN', DEFAULT_TIER_1_PATTERN),
  tier2: compilePattern('TARGET_TIER_2_PATTERN', DEFAULT_TIER_2_PATTERN),
  tier3: compilePattern('TARGET_TIER_3_PATTERN', DEFAULT_TIER_3_PATTERN),
  target: compilePattern('TARGET_CONTACT_PATTERN', DEFAULT_TARGET_PATTERN),
};

export function classifyTier(combinedText: string): ContactPriorityTier {
  if (TIER_PATTERNS.tier1?.test(combinedText)) return 'TIER_1';
  if (TIER_PATTERNS.tier2?.test(combinedText)) return 'TIER_2';
  if (TIER_PATTERNS.tier3?.test(combinedText)) return 'TIER_3';
  if (TIER_PATTERNS.target?.test(combinedText)) return 'TIER_2';
  return 'NONE';
}

// ---------------------------------------------------------------------------
// Send / batch limits (from meetup-networker)
// ---------------------------------------------------------------------------

export const BATCH = {
  DEFAULT_SIZE: 12,
  MIN_SIZE: 10,
  MAX_SIZE: 15,
  DEFAULT_MAX_SENDS: 8,
} as const;

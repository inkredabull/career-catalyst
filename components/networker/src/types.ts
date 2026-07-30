/**
 * Shared types for the networker CLI.
 *
 * Two distinct contact shapes coexist:
 *  - TrackedContact  — lifecycle-managed contacts stored in the local tracker JSON
 *  - DiscoveredProfile — enriched profile returned by EnrichLayer during discovery
 */

// ---------------------------------------------------------------------------
// Lifecycle tracker types (ported from network-followups)
// ---------------------------------------------------------------------------

export const STATUS = {
  INVITED: 'INVITED',
  PENDING_WITHDRAWAL: 'PENDING_WITHDRAWAL',
  WITHDRAWN: 'WITHDRAWN',
  REINVITED_1: 'REINVITED_1',
  REINVITED_2: 'REINVITED_2',
  COMPLETE: 'COMPLETE',
} as const;

export type ContactStatus = (typeof STATUS)[keyof typeof STATUS];

export interface TrackedContact {
  /** Auto-incrementing ID assigned at insert time */
  id: number;
  name: string;
  linkedInUrl: string;
  originalMessage: string;
  /** ISO date string or null */
  dateSent: string | null;
  status: ContactStatus;
  /** ISO date string or null */
  withdrawnDate: string | null;
  attemptsUsed: number;
  /** ISO date string or null */
  lastAttemptDate: string | null;
  /** ISO date string or null */
  nextEligibleDate: string | null;
  variant1: string;
  variant2: string;
  /** Free-form notes (title, company, category, etc.) */
  notes: string;
}

export type TrackedContactUpdate = Partial<
  Omit<TrackedContact, 'id' | 'name' | 'linkedInUrl' | 'originalMessage' | 'dateSent'>
>;

// ---------------------------------------------------------------------------
// Discovery / profile-lookup types (ported from meetup-networker)
// ---------------------------------------------------------------------------

export type ContactPriorityTier = 'TIER_1' | 'TIER_2' | 'TIER_3' | 'NONE';

export interface DiscoveredProfile {
  name: string;
  firstName?: string;
  lastName?: string;
  currentTitle?: string;
  currentCompany?: string;
  location?: string;
  linkedInUrl?: string;
  isTargetContact?: boolean;
  priorityTier?: ContactPriorityTier;
  domain?: string;
  summary?: string;
  condensedSummary?: string;
  error?: string;
  connectionSent?: boolean;
}

// ---------------------------------------------------------------------------
// Workflow result types (ported from network-followups WorkflowService)
// ---------------------------------------------------------------------------

export interface WithdrawalCandidate {
  contact: TrackedContact;
  daysSinceSent: number;
}

export interface ReInviteCandidate {
  contact: TrackedContact;
  /** variant1 or variant2 depending on attempt count */
  messageToSend: string;
  attemptNumber: number;
}

export interface MonthlyReviewResult {
  toWithdraw: WithdrawalCandidate[];
  toReInvite: ReInviteCandidate[];
}

export interface MessageVariants {
  variant1: string;
  variant2: string;
}

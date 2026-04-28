/**
 * Tracker service — JSON file-backed CRUD + workflow logic.
 *
 * Merges network-followups SheetService (storage) and WorkflowService (logic),
 * replacing the Google Sheets runtime with a local JSON file.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import {
  TrackedContact,
  TrackedContactUpdate,
  ContactStatus,
  MonthlyReviewResult,
  WithdrawalCandidate,
  ReInviteCandidate,
  STATUS,
} from '../types.js';
import { DAYS, MAX_ATTEMPTS, getTrackerFile } from '../config.js';

// ---------------------------------------------------------------------------
// JSON I/O
// ---------------------------------------------------------------------------

function readAll(): TrackedContact[] {
  const file = getTrackerFile();
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as TrackedContact[];
  } catch {
    console.error(`Could not parse tracker file at ${file}`);
    return [];
  }
}

function writeAll(contacts: TrackedContact[]): void {
  const file = getTrackerFile();
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(contacts, null, 2), 'utf-8');
}

function nextId(contacts: TrackedContact[]): number {
  return contacts.length === 0 ? 1 : Math.max(...contacts.map(c => c.id)) + 1;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function toDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function iso(d: Date | null): string | null {
  return d ? d.toISOString().split('T')[0] : null;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function getAllContacts(): TrackedContact[] {
  return readAll();
}

export function getContact(id: number): TrackedContact | undefined {
  return readAll().find(c => c.id === id);
}

export function appendContact(
  contact: Omit<TrackedContact, 'id'>
): TrackedContact {
  const all = readAll();
  const row: TrackedContact = { id: nextId(all), ...contact };
  writeAll([...all, row]);
  return row;
}

export function updateContact(id: number, updates: TrackedContactUpdate): boolean {
  const all = readAll();
  const idx = all.findIndex(c => c.id === id);
  if (idx === -1) return false;
  all[idx] = { ...all[idx], ...updates };
  writeAll(all);
  return true;
}

// ---------------------------------------------------------------------------
// Workflow logic (ported from network-followups WorkflowService)
// ---------------------------------------------------------------------------

function isStatus(contact: TrackedContact, ...statuses: ContactStatus[]): boolean {
  return (statuses as string[]).includes(contact.status);
}

/**
 * Identifies contacts to withdraw (>30 days since sent) and contacts eligible
 * for re-invite (past cooldown, attempts remaining).
 */
export function runMonthlyReview(): MonthlyReviewResult {
  const today = new Date();
  const contacts = readAll();

  const toWithdraw: WithdrawalCandidate[] = [];
  const toReInvite: ReInviteCandidate[] = [];

  for (const contact of contacts) {
    // Withdrawal candidates
    if (isStatus(contact, STATUS.INVITED, STATUS.PENDING_WITHDRAWAL)) {
      const dateSent = toDate(contact.dateSent);
      if (dateSent) {
        const days = daysBetween(dateSent, today);
        if (days >= DAYS.WITHDRAWAL_THRESHOLD) {
          toWithdraw.push({ contact, daysSinceSent: days });
        }
      }
    }

    // Re-invite candidates
    if (
      isStatus(contact, STATUS.WITHDRAWN, STATUS.REINVITED_1) &&
      contact.attemptsUsed < MAX_ATTEMPTS
    ) {
      const nextEligible = toDate(contact.nextEligibleDate);
      if (nextEligible && today >= nextEligible) {
        const attemptNumber = contact.attemptsUsed + 1;
        const messageToSend =
          attemptNumber === 1
            ? contact.variant1 || contact.originalMessage
            : contact.variant2 || contact.variant1 || contact.originalMessage;
        toReInvite.push({ contact, messageToSend, attemptNumber });
      }
    }
  }

  return { toWithdraw, toReInvite };
}

export function markAsWithdrawn(id: number): boolean {
  const contact = getContact(id);
  if (!contact) return false;
  if (!isStatus(contact, STATUS.INVITED, STATUS.PENDING_WITHDRAWAL)) return false;

  const today = new Date();
  return updateContact(id, {
    status: STATUS.WITHDRAWN,
    withdrawnDate: iso(today),
    nextEligibleDate: iso(addDays(today, DAYS.LINKEDIN_COOLDOWN)),
  });
}

export function markAsReInvited(id: number): boolean {
  const contact = getContact(id);
  if (!contact) return false;
  if (!isStatus(contact, STATUS.WITHDRAWN, STATUS.REINVITED_1)) return false;
  if (contact.attemptsUsed >= MAX_ATTEMPTS) return false;

  const today = new Date();
  const newAttempts = contact.attemptsUsed + 1;
  const newStatus: ContactStatus = newAttempts >= MAX_ATTEMPTS ? STATUS.REINVITED_2 : STATUS.REINVITED_1;

  return updateContact(id, {
    status: newStatus,
    attemptsUsed: newAttempts,
    lastAttemptDate: iso(today),
    nextEligibleDate:
      newAttempts >= MAX_ATTEMPTS ? null : iso(addDays(today, DAYS.LINKEDIN_COOLDOWN)),
  });
}

export function markAsComplete(id: number): boolean {
  return updateContact(id, { status: STATUS.COMPLETE });
}

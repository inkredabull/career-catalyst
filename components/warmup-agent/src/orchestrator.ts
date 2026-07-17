import { readFileSync } from 'fs';
import { extractSpreadsheetId } from '@inkredabull/career-catalyst-core';
import { GmailDraftService } from './adapters/gmail';
import { GoogleContactsService } from './adapters/google-contacts';
import { mergeHistoryIntoContacts, loadContactsFromJson } from './contacts/loader';
import { WarmupSheetService, historyRowToPlanned } from './data/sheet-service';
import { WarmupCorrector } from './generation/corrector';
import { buildDigestEmail } from './notifications/digest';
import { planRun, type RunSpec } from './planner/run-planner';
import { createDefaultRegistry, type ToolRegistry } from './tools/registry';
import type { ContactRunResult, RunResult, ScorableContact, WarmupHistoryRow } from './types';

export interface OrchestratorConfig {
  spreadsheetUrl?: string;
  contactsJson?: string;
  /** Load contact pool from Google People API */
  useGoogleContacts?: boolean;
  contactCount?: number;
  excludedLabelPrefixes?: string[];
  excludedEmails?: string[];
  dryRun?: boolean;
  skipDigest?: boolean;
  myEmail?: string;
}

export interface PlanPhaseResult {
  spec: RunSpec;
  historyWritten: boolean;
  toolHealth: ReturnType<ToolRegistry['getHealth']>;
}

export interface RunPhaseResult {
  spec: RunSpec;
  result: RunResult;
  historyWritten: boolean;
}

export class WarmupOrchestrator {
  private sheetService: WarmupSheetService;
  private gmailService: GmailDraftService;
  private googleContactsService: GoogleContactsService;
  private corrector: WarmupCorrector;
  private registry: ToolRegistry;

  constructor(deps?: {
    sheetService?: WarmupSheetService;
    gmailService?: GmailDraftService;
    googleContactsService?: GoogleContactsService;
    corrector?: WarmupCorrector;
    registry?: ToolRegistry;
  }) {
    this.sheetService = deps?.sheetService ?? new WarmupSheetService();
    this.gmailService = deps?.gmailService ?? new GmailDraftService();
    this.googleContactsService = deps?.googleContactsService ?? new GoogleContactsService();
    this.corrector = deps?.corrector ?? new WarmupCorrector();
    this.registry = deps?.registry ?? createDefaultRegistry();
  }

  async planPhase(config: OrchestratorConfig): Promise<PlanPhaseResult> {
    const { spec } = await this.buildPlan(config);

    if (config.spreadsheetUrl && !config.dryRun) {
      const spreadsheetId = extractSpreadsheetId(config.spreadsheetUrl);
      const rows = spec.contacts.map(item =>
        historyRowToPlanned(
          {
            contactId: item.contact.contactId,
            name: item.contact.displayName,
            email: item.contact.email,
            linkedInUrl: item.contact.linkedInUrl,
            relationshipTier: item.contact.relationshipTier,
            subjectVariant: item.subjectVariantId,
            subjectLine: item.subjectLine,
            notes: item.score.rationale,
          },
          spec.runId
        )
      );
      await this.sheetService.appendRows(spreadsheetId, rows);
    }

    return {
      spec,
      historyWritten: Boolean(config.spreadsheetUrl && !config.dryRun),
      toolHealth: this.registry.getHealth(),
    };
  }

  /** Full PARC cycle: Plan → Act (enrich + generate) → Observe (judge) → Correct → Deliver */
  async runPhase(config: OrchestratorConfig): Promise<RunPhaseResult> {
    const { spec } = await this.buildPlan(config);
    const contactResults: ContactRunResult[] = [];
    let totalCostUsd = 0;

    for (const planned of spec.contacts) {
      let result = await this.corrector.processContact(planned, { dryRun: config.dryRun });

      if (!config.dryRun && result.status === 'DRAFT_CREATED' && result.draft && result.email) {
        try {
          const draft = await this.gmailService.createDraft(
            result.email,
            result.draft.subject,
            result.draft.bodyHtml,
            result.draft.bodyText
          );
          result = { ...result, draftUrl: draft.draftUrl, draftId: draft.draftId };
        } catch (error) {
          result = {
            ...result,
            status: 'FAILED',
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }

      totalCostUsd += result.costUsd;
      contactResults.push(result);
    }

    const runResult: RunResult = {
      runId: spec.runId,
      createdAt: spec.createdAt,
      contacts: contactResults,
      totalCostUsd,
      digestSent: false,
    };

    let historyWritten = false;
    if (config.spreadsheetUrl && !config.dryRun) {
      const spreadsheetId = extractSpreadsheetId(config.spreadsheetUrl);
      await this.sheetService.ensureSheet(spreadsheetId);
      const rows = contactResults.map(r => this.contactResultToHistoryRow(r, spec.runId));
      await this.sheetService.appendRows(spreadsheetId, rows);
      historyWritten = true;
    }

    if (!config.dryRun && !config.skipDigest) {
      const myEmail = config.myEmail ?? process.env.MY_EMAIL ?? process.env.WARMUP_MY_EMAIL;
      if (myEmail) {
        const digest = buildDigestEmail(runResult);
        await this.gmailService.sendEmail(myEmail, digest.subject, digest.body);
        runResult.digestSent = true;
      }
    }

    return { spec, result: runResult, historyWritten };
  }

  /** Sync Google Contacts to JSON (for inspection or caching) */
  async syncContacts(config: Pick<OrchestratorConfig, 'excludedLabelPrefixes' | 'excludedEmails'>): Promise<ScorableContact[]> {
    return this.googleContactsService.fetchScorableContacts({
      excludedLabelPrefixes: config.excludedLabelPrefixes,
      excludedEmails: config.excludedEmails,
    });
  }

  private async buildPlan(config: OrchestratorConfig): Promise<{
    spec: RunSpec;
    history: WarmupHistoryRow[];
    historyWritten: boolean;
  }> {
    const contacts = await this.loadContacts(config);
    let history: WarmupHistoryRow[] = [];

    if (config.spreadsheetUrl) {
      const spreadsheetId = extractSpreadsheetId(config.spreadsheetUrl);
      await this.sheetService.ensureSheet(spreadsheetId);
      history = await this.sheetService.readHistory(spreadsheetId);
    }

    const historyIndex = this.sheetService.buildContactHistoryIndex(history);
    const enrichedContacts = mergeHistoryIntoContacts(contacts, historyIndex);

    const spec = planRun({
      contacts: enrichedContacts,
      history,
      count: config.contactCount ?? 5,
      excludedLabelPrefixes: config.excludedLabelPrefixes,
      excludedEmails: config.excludedEmails,
    });

    return { spec, history, historyWritten: false };
  }

  private contactResultToHistoryRow(result: ContactRunResult, runId: string): WarmupHistoryRow {
    const now = new Date().toISOString().slice(0, 10);
    return {
      contactId: result.contactId,
      name: result.displayName,
      email: result.email,
      lastWarmup: result.status === 'DRAFT_CREATED' ? now : undefined,
      lastEnrichment: result.enrichment?.primarySource ? now : undefined,
      enrichmentSource: result.enrichment?.primarySource,
      hookType: result.hook?.hookType,
      hookConfidence: result.hook?.confidence,
      subjectLine: result.draft?.subject,
      draftQuality: result.judge?.score,
      draftUrl: result.draftUrl,
      status: result.status,
      runId,
      notes: result.error ?? result.hook?.evidence,
    };
  }

  private async loadContacts(config: OrchestratorConfig): Promise<ScorableContact[]> {
    if (config.contactsJson) {
      return loadContactsFromJson(config.contactsJson);
    }

    const useGoogle =
      config.useGoogleContacts ||
      process.env.WARMUP_USE_GOOGLE_CONTACTS === 'true';

    if (useGoogle) {
      return this.googleContactsService.fetchScorableContacts({
        excludedLabelPrefixes: config.excludedLabelPrefixes,
        excludedEmails: config.excludedEmails,
      });
    }

    const fixturePath = process.env.WARMUP_CONTACTS_FIXTURE;
    if (fixturePath) {
      return loadContactsFromJson(readFileSync(fixturePath, 'utf-8'));
    }

    throw new Error(
      'No contacts source configured. Use --from-google, --contacts, WARMUP_USE_GOOGLE_CONTACTS=true, or WARMUP_CONTACTS_FIXTURE.'
    );
  }
}

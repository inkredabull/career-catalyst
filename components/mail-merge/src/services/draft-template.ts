// Picking the *template* draft out of a mailbox that also holds copies of it.
//
// createWarmupDrafts (and any run of doSendEmails against a token-free subject) leaves behind
// drafts whose subject line is identical to the template's. A plain `find` on subject can then
// return one of those already-interpolated copies, and every draft the next run produces is
// addressed to a different person but greets whoever the copy was rendered for — the "multiple
// copies with the same first name" symptom. The template is the draft that predates its copies
// and still carries {{tokens}}, so select on that instead.

/** Minimal slice of GmailMessage this module needs — keeps the picker unit-testable without GmailApp. */
export interface TemplateMessage {
  getSubject(): string;
  getDate(): Date;
  getPlainBody(): string;
  getBody(): string;
}

export interface TemplateDraft {
  getMessage(): TemplateMessage;
}

const TOKEN_RE = /{{[^{}]+}}/;

/** True if `text` holds at least one {{token}}. */
export const containsTokens = (text: string): boolean => TOKEN_RE.test(text ?? '');

/** True if the draft still has at least one unresolved {{token}} — i.e. it is a template, not a copy. */
export const hasUnresolvedTokens = (msg: TemplateMessage): boolean =>
  containsTokens(msg.getSubject()) || containsTokens(msg.getPlainBody()) || containsTokens(msg.getBody());

export const draftsMatchingSubject = <T extends TemplateDraft>(drafts: T[], subjectLine: string): T[] =>
  drafts.filter(d => d.getMessage().getSubject() === subjectLine);

/**
 * Pick the template among drafts sharing `subjectLine`: oldest first, preferring one that still
 * has {{tokens}}. Tokens win over age because a template that gets edited and re-saved can end up
 * newer than the copies made from it; age is the tiebreaker, and the fallback for templates that
 * legitimately contain no tokens.
 */
export const selectTemplateDraft = <T extends TemplateDraft>(
  drafts: T[],
  subjectLine: string,
): T | undefined => {
  const oldestFirst = draftsMatchingSubject(drafts, subjectLine)
    .sort((a, b) => a.getMessage().getDate().getTime() - b.getMessage().getDate().getTime());

  return oldestFirst.find(d => hasUnresolvedTokens(d.getMessage())) ?? oldestFirst[0];
};

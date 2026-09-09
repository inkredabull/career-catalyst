// Regression test for: warmup/mail-merge runs leave drafts sharing the template's subject line,
// so picking the first subject match could return an already-personalized copy and render every
// subsequent draft with that copy's first name.

import { hasUnresolvedTokens, selectTemplateDraft } from '../src/services/draft-template';

const draft = (subject: string, date: string, plain: string, html = '') => ({
  id: `${subject}@${date}`,
  getMessage: () => ({
    getSubject: () => subject,
    getDate: () => new Date(date),
    getPlainBody: () => plain,
    getBody: () => html,
  }),
});

const SUBJECT = 'Catching up + a quick ask';

const template = draft(SUBJECT, '2026-01-01T09:00:00Z', 'Hi {{First}},\n\n{{Ask}}');
const copyForDana = draft(SUBJECT, '2026-02-01T09:00:00Z', 'Hi Dana,\n\nGot a minute?');
const copyForSam = draft(SUBJECT, '2026-03-01T09:00:00Z', 'Hi Sam,\n\nGot a minute?');

describe('selectTemplateDraft', () => {
  it('picks the template rather than a personalized copy created from it', () => {
    // Copies first: this is the ordering that used to hand back "Hi Dana" for everyone.
    expect(selectTemplateDraft([copyForDana, copyForSam, template], SUBJECT)).toBe(template);
  });

  it('picks the oldest match when several still carry tokens', () => {
    const newerTemplate = draft(SUBJECT, '2026-04-01T09:00:00Z', 'Hi {{First}}, take two');
    expect(selectTemplateDraft([newerTemplate, template], SUBJECT)).toBe(template);
  });

  it('prefers a tokenized draft over an older token-free copy', () => {
    // A re-saved template can end up newer than the copies made from it.
    const older = draft(SUBJECT, '2025-12-01T09:00:00Z', 'Hi Dana,\n\nGot a minute?');
    expect(selectTemplateDraft([older, template], SUBJECT)).toBe(template);
  });

  it('detects tokens that live only in the HTML body', () => {
    const htmlOnly = draft(SUBJECT, '2026-05-01T09:00:00Z', '', '<p>Hi {{First}}</p>');
    expect(selectTemplateDraft([copyForDana, htmlOnly], SUBJECT)).toBe(htmlOnly);
  });

  it('falls back to the oldest match when no draft has tokens', () => {
    expect(selectTemplateDraft([copyForSam, copyForDana], SUBJECT)).toBe(copyForDana);
  });

  it('ignores drafts with a different subject', () => {
    const other = draft('Some other thread', '2020-01-01T09:00:00Z', 'Hi {{First}}');
    expect(selectTemplateDraft([other, template], SUBJECT)).toBe(template);
  });

  it('returns undefined when nothing matches', () => {
    expect(selectTemplateDraft([copyForDana], 'Nope')).toBeUndefined();
  });

  it('does not mutate the caller array', () => {
    const drafts = [copyForSam, template, copyForDana];
    selectTemplateDraft(drafts, SUBJECT);
    expect(drafts).toEqual([copyForSam, template, copyForDana]);
  });
});

describe('hasUnresolvedTokens', () => {
  it('is true for a subject-line token', () => {
    expect(hasUnresolvedTokens(draft('Role at {{Company}}', '2026-01-01T09:00:00Z', 'body').getMessage()))
      .toBe(true);
  });

  it('is false for fully rendered copy', () => {
    expect(hasUnresolvedTokens(copyForDana.getMessage())).toBe(false);
  });
});

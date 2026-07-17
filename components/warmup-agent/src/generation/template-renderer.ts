import { STATIC_TEMPLATE_VALUES } from '../config';
import { WARMUP_TEMPLATE_BODY_REFERENCE } from '../config/template';
import type { GeneratedTokens, RenderedDraft, ScorableContact } from '../types';

export const contactSearchUrl = (displayName: string): string =>
  `https://contacts.google.com/search/${encodeURIComponent(displayName)}`;

export const renderWarmupTemplate = (
  contact: ScorableContact,
  subjectLine: string,
  tokens: GeneratedTokens
): RenderedDraft => {
  const firstName = contact.displayName.trim().split(/\s+/)[0] ?? '';
  const replacements: Record<string, string> = {
    First: firstName,
    Zeitgeisty: tokens.Zeitgeisty,
    Personalization: tokens.Personalization,
    Reciprocate: STATIC_TEMPLATE_VALUES.Reciprocate,
    Valediction: STATIC_TEMPLATE_VALUES.Valediction,
    ContactURL: contactSearchUrl(contact.displayName),
  };

  let bodyText = WARMUP_TEMPLATE_BODY_REFERENCE;
  for (const [key, value] of Object.entries(replacements)) {
    bodyText = bodyText.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }

  const bodyHtml = bodyText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>\n');

  return {
    subject: subjectLine,
    bodyText,
    bodyHtml,
    tokens: replacements,
  };
};

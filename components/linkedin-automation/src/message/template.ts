import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

const DEFAULT_TEMPLATE = 'Hi {{firstName}}, looking forward to connecting!';

export function loadTemplate(templatePath?: string): string {
  if (process.env.LINKEDIN_MESSAGE_TEMPLATE) return process.env.LINKEDIN_MESSAGE_TEMPLATE;
  const filePath = templatePath ?? resolve(projectRoot, 'templates', 'linkedin-connect.txt');
  try {
    return readFileSync(filePath, 'utf-8').trim();
  } catch {
    return DEFAULT_TEMPLATE;
  }
}

export interface MessageTokens {
  firstName?: string;
  domain?: string;
  round?: string;
  summary?: string;
  event?: string;
  [key: string]: string | undefined;
}

/**
 * Replaces {{token}} placeholders in a template string.
 * Pure function — no I/O, safe to unit test.
 */
export function buildMessage(template: string, tokens: MessageTokens): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => tokens[key] ?? '');
}

/** Parses the company LinkedIn slug from a company page URL. Pure. */
export function parseCompanySlug(linkedInUrl: string): string {
  const match = linkedInUrl.match(/linkedin\.com\/company\/([^/?#]+)/);
  return match?.[1] ?? '';
}

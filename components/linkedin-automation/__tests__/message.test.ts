import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildMessage, parseCompanySlug } from '../src/message/template.js';

describe('buildMessage', () => {
  it('replaces a single token', () => {
    expect(buildMessage('Hi {{firstName}}!', { firstName: 'Alice' })).toBe('Hi Alice!');
  });

  it('replaces multiple tokens', () => {
    const result = buildMessage('Hi {{firstName}}, saw your work in {{domain}}', {
      firstName: 'Bob',
      domain: 'fintech',
    });
    expect(result).toBe('Hi Bob, saw your work in fintech');
  });

  it('replaces the same token appearing twice', () => {
    const result = buildMessage('{{firstName}} and {{firstName}}', { firstName: 'Alice' });
    expect(result).toBe('Alice and Alice');
  });

  it('leaves unknown tokens as empty string', () => {
    expect(buildMessage('Hi {{firstName}} {{unknown}}', { firstName: 'Alice' })).toBe('Hi Alice ');
  });

  it('handles empty token values', () => {
    expect(buildMessage('Hello{{round}}!', { round: '' })).toBe('Hello!');
  });

  it('returns the template unchanged when no tokens present', () => {
    expect(buildMessage('No tokens here', {})).toBe('No tokens here');
  });
});

describe('parseCompanySlug', () => {
  it('extracts slug from a standard company URL', () => {
    expect(parseCompanySlug('https://www.linkedin.com/company/acme-corp')).toBe('acme-corp');
  });

  it('strips trailing slashes and query params', () => {
    expect(parseCompanySlug('https://linkedin.com/company/acme/?trk=foo')).toBe('acme');
  });

  it('returns empty string for non-company URLs', () => {
    expect(parseCompanySlug('https://linkedin.com/in/johndoe')).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(parseCompanySlug('')).toBe('');
  });
});

describe('loadTemplate with env override', () => {
  beforeEach(() => { process.env.LINKEDIN_MESSAGE_TEMPLATE = 'Override {{firstName}}'; });
  afterEach(() => { delete process.env.LINKEDIN_MESSAGE_TEMPLATE; });

  it('returns the env var when set', async () => {
    const { loadTemplate } = await import('../src/message/template.js');
    expect(loadTemplate()).toBe('Override {{firstName}}');
  });
});

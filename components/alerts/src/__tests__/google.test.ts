import { timeFrameToAfterDate, buildTitleClause, parseResultTitle } from '../google';

describe('timeFrameToAfterDate', () => {
  it('returns a YYYY-MM-DD string', () => {
    const result = timeFrameToAfterDate('r86400');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('r86400 (1 day) returns yesterday or today', () => {
    const result = new Date(timeFrameToAfterDate('r86400'));
    const now = new Date();
    const diffMs = now.getTime() - result.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(0);
    expect(diffMs).toBeLessThan(2 * 24 * 60 * 60 * 1000); // within 2 days
  });

  it('r604800 (7 days) returns a date ~7 days ago', () => {
    const result = new Date(timeFrameToAfterDate('r604800'));
    const now = new Date();
    const diffDays = (now.getTime() - result.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(6);
    expect(diffDays).toBeLessThan(8);
  });
});

describe('buildTitleClause', () => {
  it('wraps each title in quotes and joins with OR', () => {
    const result = buildTitleClause(['CTO', 'VP Engineering']);
    expect(result).toBe('("CTO" OR "VP Engineering")');
  });

  it('handles a single title', () => {
    expect(buildTitleClause(['Head of Engineering'])).toBe('("Head of Engineering")');
  });

  it('handles titles with special characters', () => {
    const result = buildTitleClause(['Chief of Staff to the CTO', 'CPTO']);
    expect(result).toBe('("Chief of Staff to the CTO" OR "CPTO")');
  });
});

describe('parseResultTitle', () => {
  it('parses "TITLE at COMPANY | SITE" format', () => {
    const r = parseResultTitle('VP Engineering at Stripe | Ashby');
    expect(r).toEqual({ title: 'VP Engineering', company: 'Stripe' });
  });

  it('parses "TITLE at COMPANY" without site suffix', () => {
    const r = parseResultTitle('Head of Engineering at Acme');
    expect(r).toEqual({ title: 'Head of Engineering', company: 'Acme' });
  });

  it('parses "TITLE - COMPANY | SITE" format', () => {
    const r = parseResultTitle('Director of Engineering - Figma | Wellfound');
    expect(r).toEqual({ title: 'Director of Engineering', company: 'Figma' });
  });

  it('parses em-dash separator', () => {
    const r = parseResultTitle('CTO – Some Startup');
    expect(r).toEqual({ title: 'CTO', company: 'Some Startup' });
  });

  it('strips site suffix when no company separator found', () => {
    const r = parseResultTitle('CTO | Wellfound');
    expect(r).toEqual({ title: 'CTO', company: '' });
  });

  it('returns full string as title when no pattern matches', () => {
    const r = parseResultTitle('Head of Engineering');
    expect(r).toEqual({ title: 'Head of Engineering', company: '' });
  });

  it('handles multi-word company names', () => {
    const r = parseResultTitle('Head of AI Engineering at Scale AI | Ashby');
    expect(r).toEqual({ title: 'Head of AI Engineering', company: 'Scale AI' });
  });

  it('parses "TITLE @ COMPANY | SITE" format (Ashby)', () => {
    const r = parseResultTitle('Head of Technical Recruiting @ Notion | Jobs');
    expect(r).toEqual({ title: 'Head of Technical Recruiting', company: 'Notion' });
  });

  it('skips leading "Jobs" noise segment', () => {
    const r = parseResultTitle('Jobs | Chief of Staff @ Superpower');
    expect(r).toEqual({ title: 'Chief of Staff', company: 'Superpower' });
  });

  it('parses "TITLE @ COMPANY" without pipe segments', () => {
    const r = parseResultTitle('VP Engineering @ Stripe');
    expect(r).toEqual({ title: 'VP Engineering', company: 'Stripe' });
  });

  it('parses "COMPANY hiring TITLE in LOCATION" format', () => {
    const r = parseResultTitle('Arlo Hotels hiring Director of Engineering in Washington, DC');
    expect(r).toEqual({ title: 'Director of Engineering', company: 'Arlo Hotels' });
  });

  it('parses "COMPANY hiring TITLE" without location', () => {
    const r = parseResultTitle('Acme Corp hiring VP Engineering | LinkedIn');
    expect(r).toEqual({ title: 'VP Engineering', company: 'Acme Corp' });
  });

  it('extracts company from remaining segment stripping Careers suffix', () => {
    const r = parseResultTitle('Senior Forward Deployed Engineer, Cloud Applied AI | Google Careers');
    expect(r).toEqual({ title: 'Senior Forward Deployed Engineer, Cloud Applied AI', company: 'Google' });
  });

  it('extracts company from remaining segment without suffix', () => {
    const r = parseResultTitle('Director of Engineering | Stripe');
    expect(r).toEqual({ title: 'Director of Engineering', company: 'Stripe' });
  });
});

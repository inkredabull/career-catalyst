import { buildAppleScript, normalizeToHandle } from '../services/messages';

describe('normalizeToHandle', () => {
  it('passes email handles through untouched (iMessage only)', () => {
    expect(normalizeToHandle('someone@example.com')).toBe('someone@example.com');
    expect(normalizeToHandle('  someone@example.com  ')).toBe('someone@example.com');
  });

  it('keeps E.164 input, stripping stray punctuation after the +', () => {
    expect(normalizeToHandle('+14158230858')).toBe('+14158230858');
    expect(normalizeToHandle('+1 (415) 823-0858')).toBe('+14158230858');
  });

  it('assumes US for 10 digits', () => {
    expect(normalizeToHandle('(415) 823-0858')).toBe('+14158230858');
    expect(normalizeToHandle('415-823-0858')).toBe('+14158230858');
    expect(normalizeToHandle('4158230858')).toBe('+14158230858');
  });

  it('adds the + for 11 digits starting with 1', () => {
    expect(normalizeToHandle('14158230858')).toBe('+14158230858');
    expect(normalizeToHandle('1 (415) 823-0858')).toBe('+14158230858');
  });

  it('returns unrecognized input unchanged rather than throwing', () => {
    // Deliberately lenient, unlike mail-merge's normalizePhoneNumber which
    // throws. Messages.app gets the final say on whether a handle is valid.
    expect(normalizeToHandle('12345')).toBe('12345');
    expect(normalizeToHandle('not a number')).toBe('not a number');
    expect(normalizeToHandle('+44 20 7946 0958')).toBe('+442079460958');
  });

  it('handles empty and nullish input without throwing', () => {
    expect(normalizeToHandle('')).toBe('');
    expect(normalizeToHandle('   ')).toBe('');
    expect(normalizeToHandle(null)).toBe('');
    expect(normalizeToHandle(undefined)).toBe('');
  });
});

describe('buildAppleScript', () => {
  const script = buildAppleScript();

  it('tries iMessage before falling back to SMS', () => {
    expect(script.indexOf('service type is iMessage')).toBeGreaterThanOrEqual(0);
    expect(script.indexOf('service type is SMS')).toBeGreaterThan(
      script.indexOf('service type is iMessage')
    );
  });

  it('reports which service delivered the message', () => {
    expect(script).toContain('return "IMESSAGE"');
    expect(script).toContain('return "SMS"');
  });

  it('surfaces a distinguishable error when both services fail', () => {
    expect(script).toContain('BOTH_FAILED');
  });

  it('takes the handle and body as argv so no escaping is needed', () => {
    expect(script).toContain('on run argv');
    expect(script).toContain('set theHandle to item 1 of argv');
    expect(script).toContain('set theMsg to item 2 of argv');
  });
});

import { describe, it, expect } from 'vitest';
import { generateFollowScript } from '../src/scripts/follow.js';

describe('generateFollowScript', () => {
  it('returns a self-invoking async function', () => {
    const script = generateFollowScript();
    expect(script.trim()).toMatch(/^\(async function\(\)/);
    expect(script.trim()).toMatch(/\(\);$/s);
  });

  it('looks for a Follow button by text', () => {
    expect(generateFollowScript()).toContain("'follow'");
  });

  it('checks for already-following state before clicking', () => {
    expect(generateFollowScript()).toContain("'following'");
  });

  it('polls with a deadline before giving up', () => {
    expect(generateFollowScript()).toContain('deadline');
  });
});

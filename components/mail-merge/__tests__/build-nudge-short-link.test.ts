import { buildNudgeShortLink } from '../src/services/gmail';

describe('buildNudgeShortLink', () => {
  it('returns empty string when baseUrl is falsy', () => {
    expect(buildNudgeShortLink('', 'abc123')).toBe('');
  });

  it('returns empty string when id is falsy', () => {
    expect(buildNudgeShortLink('http://localhost:3000', '')).toBe('');
  });

  it('builds a short /n/:id link', () => {
    expect(buildNudgeShortLink('http://localhost:3000', 'abc123')).toBe('http://localhost:3000/n/abc123');
  });
});

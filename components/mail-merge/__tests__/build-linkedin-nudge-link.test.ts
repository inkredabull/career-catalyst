import { buildLinkedInNudgeLink } from '../src/services/gmail';

describe('buildLinkedInNudgeLink', () => {
  it('returns empty string when baseUrl is falsy', () => {
    expect(buildLinkedInNudgeLink('', 'https://linkedin.com/in/someone', 'Hi', 'Sam')).toBe('');
  });

  it('returns empty string when linkedinUrl is falsy', () => {
    expect(buildLinkedInNudgeLink('http://localhost:3000', '', 'Hi', 'Sam')).toBe('');
  });

  it('builds a url with percent-encoded params', () => {
    const link = buildLinkedInNudgeLink(
      'http://localhost:3000', 'https://linkedin.com/in/someone', 'Hi Sam, got a minute?', 'Sam'
    );
    expect(link).toBe(
      'http://localhost:3000/warmup-linkedin-nudge?'
      + 'url=https%3A%2F%2Flinkedin.com%2Fin%2Fsomeone'
      + '&message=Hi%20Sam%2C%20got%20a%20minute%3F'
      + '&firstName=Sam'
    );
  });
});

import { getLinkedInUrl } from '../src/services/contacts';

type Person = Parameters<typeof getLinkedInUrl>[0];

const personWithUrls = (urls: { type?: string; value?: string }[]): Person =>
  ({ urls } as unknown as Person);

describe('getLinkedInUrl', () => {
  it('matches a url whose type is "linkedin", case-insensitively', () => {
    const person = personWithUrls([
      { type: 'Work', value: 'https://example.com' },
      { type: 'LinkedIn', value: 'https://linkedin.com/in/someone' },
    ]);
    expect(getLinkedInUrl(person)).toBe('https://linkedin.com/in/someone');
  });

  it('matches by value containing linkedin.com when type is absent or different', () => {
    const person = personWithUrls([
      { type: 'other', value: 'https://www.linkedin.com/in/someone' },
    ]);
    expect(getLinkedInUrl(person)).toBe('https://www.linkedin.com/in/someone');
  });

  it('returns empty string when no url matches', () => {
    const person = personWithUrls([{ type: 'work', value: 'https://example.com' }]);
    expect(getLinkedInUrl(person)).toBe('');
  });

  it('returns empty string when urls is undefined', () => {
    const person = {} as Person;
    expect(getLinkedInUrl(person)).toBe('');
  });
});

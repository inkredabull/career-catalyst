import type { people_v1 } from 'googleapis';
import {
  extractLinkedInUrl,
  extractBlogUrl,
  extractTwitterHandle,
  mapPersonToScorable,
  shouldIncludeContact,
  buildExcludedGroupIds,
  wrapGoogleContactsError,
  type ContactGroupInfo,
} from '../src/adapters/google-contacts';

const samplePerson: people_v1.Schema$Person = {
  resourceName: 'people/c123',
  names: [{ displayName: 'Jane Doe' }],
  emailAddresses: [{ value: 'jane@example.com', type: 'home' }],
  urls: [
    { value: 'https://www.linkedin.com/in/janedoe', type: 'linkedin' },
    { value: 'https://janedoe.dev/feed.xml', type: 'blog' },
  ],
  biographies: [{ value: 'Met at SaaStr 2024' }],
  memberships: [{ contactGroupMembership: { contactGroupId: 'g1' } }],
};

const groups = new Map<string, ContactGroupInfo>([
  ['g1', { id: 'g1', name: 'Archetype/Mentor', groupType: 'USER_CONTACT_GROUP' }],
  ['g2', { id: 'g2', name: 'Archetype/Unhelpful', groupType: 'USER_CONTACT_GROUP' }],
]);

const userGroupIds = new Set(['g1', 'g2']);

describe('google-contacts', () => {
  it('extracts LinkedIn, blog, and Twitter URLs', () => {
    const urls = [
      { value: 'https://linkedin.com/in/jane' },
      { value: 'https://medium.com/@jane' },
      { value: 'https://twitter.com/jane' },
    ];
    expect(extractLinkedInUrl(urls)).toContain('linkedin.com');
    expect(extractBlogUrl(urls)).toContain('medium.com');
    expect(extractTwitterHandle(urls)).toBe('@jane');
  });

  it('maps a Person to ScorableContact', () => {
    const contact = mapPersonToScorable(samplePerson, groups, userGroupIds);
    expect(contact?.displayName).toBe('Jane Doe');
    expect(contact?.email).toBe('jane@example.com');
    expect(contact?.linkedInUrl).toContain('linkedin.com');
    expect(contact?.blogUrl).toContain('janedoe.dev');
    expect(contact?.relationshipTier).toBe('Archetype/Mentor');
    expect(contact?.notes).toBe('Met at SaaStr 2024');
  });

  it('excludes unhelpful label groups', () => {
    const excluded = buildExcludedGroupIds(groups);
    expect(excluded.has('g2')).toBe(true);

    const unhelpfulPerson: people_v1.Schema$Person = {
      ...samplePerson,
      memberships: [{ contactGroupMembership: { contactGroupId: 'g2' } }],
    };

    expect(
      shouldIncludeContact(unhelpfulPerson, groups, userGroupIds, excluded, new Set())
    ).toBe(false);
  });

  it('wraps insufficient scope errors with setup hint', () => {
    const err = wrapGoogleContactsError({
      code: 403,
      message: 'Request had insufficient authentication scopes.',
    });
    expect(err.message).toContain('npm run setup-gmail');
    expect(err.message).toContain('contacts.readonly');
  });
});

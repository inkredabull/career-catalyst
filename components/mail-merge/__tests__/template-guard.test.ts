// Fail-closed render guard — the send path must never emit a blank placeholder.
// Regression test for: sms-server down => job metadata null => email sent with empty
// {{Company}} / {{JobTitleShorthand}} / {{Intro}}.

import { fillInTemplateFromObject, UnresolvedTemplateError } from '../src/services/gmail';
import { clearJobMetadataCache } from '../src/services/job-metadata';

const JOB_ID = 'guard-test-job';

const MOCK_META = {
  success: true,
  jobID: JOB_ID,
  jobTitle: 'VP Engineering',
  jobTitleShorthand: 'VP Eng',
  Company: 'Acme Corp',
  jobURL: 'https://example.com/job',
  resumeURL: 'https://drive.google.com/file/d/abc123',
  'third-person-blurb': 'Anthony brings deep expertise in scaling teams.',
};

const mockFetch = (status: number, body: string): void => {
  (global as any).UrlFetchApp.fetch = jest.fn().mockReturnValue({
    getResponseCode: () => status,
    getContentText: () => body,
  });
};

const TEMPLATE = {
  subject: 'Get your help for role as {{JobTitleShorthand}} at {{Company}}?',
  text: 'Hi {{First}},\n\n{{Intro}}\n\n{{Valediction}}',
  html: '',
};

const row = (extras: Record<string, string> = {}): Record<string, string> => ({
  JobID: JOB_ID,
  First: 'Dana',
  Recipient: 'dana@example.com',
  ...extras,
});

beforeEach(() => {
  clearJobMetadataCache(JOB_ID);
});

describe('fillInTemplateFromObject fails closed', () => {
  it('throws instead of rendering blanks when the metadata server is down', () => {
    mockFetch(502, 'Bad Gateway');
    expect(() => fillInTemplateFromObject(TEMPLATE, row())).toThrow(UnresolvedTemplateError);
  });

  it('throws when the tunnel serves an ngrok HTML interstitial instead of JSON', () => {
    mockFetch(200, '<!DOCTYPE html><html><body>ngrok warning</body></html>');
    expect(() => fillInTemplateFromObject(TEMPLATE, row())).toThrow(/unified-server running/);
  });

  it('names the missing row token when metadata is fine but a column is empty', () => {
    mockFetch(200, JSON.stringify(MOCK_META));
    expect(() => fillInTemplateFromObject(TEMPLATE, row({ First: '' })))
      .toThrow(/Unresolved template token\(s\).*First/);
  });

  it('tolerates empty values for tokens that are legitimately optional', () => {
    mockFetch(200, JSON.stringify(MOCK_META));
    const template = { ...TEMPLATE, text: 'Hi {{First}} {{L}}{{PersonName}}' };
    expect(() => fillInTemplateFromObject(template, row())).not.toThrow();
  });

  it('renders every token when metadata resolves', () => {
    mockFetch(200, JSON.stringify(MOCK_META));
    const resolved = fillInTemplateFromObject(TEMPLATE, row());
    expect(resolved.subject).toBe('Get your help for role as VP Eng at Acme Corp?');
    expect(resolved.text).toContain('Hi Dana,');
    expect(resolved.text).toContain('VP Engineering');
  });
});

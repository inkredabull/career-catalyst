import { getJobMetadata, clearJobMetadataCache } from '../src/services/job-metadata';

const MOCK_META = {
  success: true,
  jobID: 'test-job',
  jobTitle: 'VP Engineering',
  Company: 'Acme Corp',
  jobURL: 'https://example.com/job',
  resumeURL: 'https://drive.google.com/file/d/abc123',
  jobTitleShorthand: 'VP Eng',
  'third-person-blurb': 'Anthony brings deep expertise in...',
};

const mockUrlFetchApp = (status: number, body: string) => {
  (global as any).UrlFetchApp.fetch = jest.fn().mockReturnValue({
    getResponseCode: () => status,
    getContentText: () => body,
  });
};

beforeEach(() => {
  clearJobMetadataCache('test-job');
  // Reset env between tests
  process.env.NGROK_TUNNEL_URL = 'http://localhost:3000';
  // Clear in-memory cache shim
  const cache = (global as any).CacheService.getScriptCache();
  cache.remove('job_test-job');
});

describe('getJobMetadata', () => {
  it('returns parsed metadata on 200 JSON response', () => {
    mockUrlFetchApp(200, JSON.stringify(MOCK_META));
    const meta = getJobMetadata('test-job');
    expect(meta).not.toBeNull();
    expect(meta?.Company).toBe('Acme Corp');
    expect(meta?.jobTitle).toBe('VP Engineering');
    expect(meta?.jobTitleShorthand).toBe('VP Eng');
    expect(meta?.thirdPersonBlurb).toBe('Anthony brings deep expertise in...');
  });

  it('returns null when server returns HTML (tunnel down / ngrok interstitial)', () => {
    mockUrlFetchApp(200, '<!DOCTYPE html><html><body>ngrok warning</body></html>');
    const meta = getJobMetadata('test-job');
    expect(meta).toBeNull();
  });

  it('returns null when server returns non-200', () => {
    mockUrlFetchApp(502, 'Bad Gateway');
    const meta = getJobMetadata('test-job');
    expect(meta).toBeNull();
  });

  it('returns null when NGROK_TUNNEL_URL is not set', () => {
    delete process.env.NGROK_TUNNEL_URL;
    const meta = getJobMetadata('test-job');
    expect(meta).toBeNull();
  });

  it('returns cached result on second call without re-fetching', () => {
    const fetchMock = jest.fn().mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify(MOCK_META),
    });
    (global as any).UrlFetchApp.fetch = fetchMock;

    getJobMetadata('test-job');
    getJobMetadata('test-job');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// Integration test — requires unified-server running at localhost:3000
// Run with: npm run test:integration

import { getJobMetadata, clearJobMetadataCache } from '../../src/services/job-metadata';

const TEST_JOB_ID = 'a5ebb4c6';

beforeEach(() => {
  clearJobMetadataCache(TEST_JOB_ID);
  const cache = (global as any).CacheService.getScriptCache();
  cache.remove(`job_${TEST_JOB_ID}`);
});

describe('getJobMetadata (integration — localhost:3000)', () => {
  it('fetches real job metadata', () => {
    const meta = getJobMetadata(TEST_JOB_ID);
    expect(meta).not.toBeNull();
    expect(typeof meta?.Company).toBe('string');
    expect(meta?.Company.length).toBeGreaterThan(0);
    expect(typeof meta?.jobTitle).toBe('string');
    expect(meta?.jobTitle.length).toBeGreaterThan(0);
  });

  it('returns cached result on second call', () => {
    getJobMetadata(TEST_JOB_ID);
    const fetchSpy = jest.spyOn((global as any).UrlFetchApp, 'fetch');
    getJobMetadata(TEST_JOB_ID);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

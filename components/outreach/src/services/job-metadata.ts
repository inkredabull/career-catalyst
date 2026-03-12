// Fetch and cache job metadata from the unified-server /llm endpoint.
// Base URL is read from the NGROK_SMS_URL Script Property (same server, same tunnel).

export interface JobMetadata {
  jobTitle: string;
  jobTitleShorthand: string;
  Company: string;
  jobURL: string;
  resumeURL: string;
  thirdPersonBlurb: string;
}

const CACHE_TTL = 21600; // 6 hours — GAS CacheService maximum

const generateThirdPersonBlurb = (baseUrl: string, jobId: string): string | null => {
  Logger.log('Calling /generate-blurb for %s', jobId);
  let response: GoogleAppsScript.URL_Fetch.HTTPResponse;
  try {
    response = UrlFetchApp.fetch(`${baseUrl}/generate-blurb`, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ jobId }),
      muteHttpExceptions: true,
    });
  } catch (e) {
    Logger.log('Error calling /generate-blurb for %s: %s', jobId, e);
    return null;
  }

  if (response.getResponseCode() !== 200) {
    Logger.log('/generate-blurb failed [%s]: %s', response.getResponseCode(), response.getContentText());
    return null;
  }

  const result = JSON.parse(response.getContentText()) as Record<string, string>;
  if (!result['success']) {
    Logger.log('/generate-blurb error for %s: %s', jobId, result['error']);
    return null;
  }

  Logger.log('Blurb generated for %s (%s chars)', jobId, String(result['blurb']?.length ?? 0));
  return result['blurb'] ?? null;
};

export const getJobMetadata = (jobId: string): JobMetadata | null => {
  if (!jobId) return null;

  // L1: ephemeral script-level cache (survives within a 6-hour window)
  const cache = CacheService.getScriptCache();
  const cached = cache.get(`job_${jobId}`);
  if (cached) return JSON.parse(cached) as JobMetadata;

  const baseUrl = PropertiesService.getScriptProperties().getProperty('NGROK_SMS_URL');
  if (!baseUrl) {
    Logger.log('NGROK_SMS_URL not set — cannot fetch job metadata for %s', jobId);
    return null;
  }

  let response: GoogleAppsScript.URL_Fetch.HTTPResponse;
  try {
    response = UrlFetchApp.fetch(`${baseUrl}/llm?jobID=${encodeURIComponent(jobId)}`, {
      method: 'get',
      muteHttpExceptions: true,
    });
  } catch (e) {
    Logger.log('Error fetching job metadata for %s: %s', jobId, e);
    return null;
  }

  if (response.getResponseCode() !== 200) {
    Logger.log('Job metadata fetch failed [%s]: %s', response.getResponseCode(), response.getContentText());
    return null;
  }

  const data = JSON.parse(response.getContentText()) as Record<string, string>;
  if (data['success'] === false as unknown) {
    Logger.log('Job metadata error for %s: %s', jobId, data['error']);
    return null;
  }

  let thirdPersonBlurb = data['third-person-blurb'] ?? '';

  // If no blurb on file, ask the server to generate one
  if (!thirdPersonBlurb) {
    Logger.log('No third-person blurb for %s — triggering generation (may take ~30s)', jobId);
    thirdPersonBlurb = generateThirdPersonBlurb(baseUrl, jobId) ?? '';
  }

  const meta: JobMetadata = {
    jobTitle: data['jobTitle'] ?? '',
    jobTitleShorthand: data['jobTitleShorthand'] ?? '',
    Company: data['Company'] ?? '',
    jobURL: data['jobURL'] ?? '',
    resumeURL: data['resumeURL'] ?? '',
    thirdPersonBlurb,
  };
  cache.put(`job_${jobId}`, JSON.stringify(meta), CACHE_TTL);
  return meta;
};

export const clearJobMetadataCache = (jobId: string): void => {
  CacheService.getScriptCache().remove(`job_${jobId}`);
};

// Fetch and cache job metadata from the unified-server /llm endpoint.
// Base URL is bundled at build time from .env via NGROK_TUNNEL_URL.

import { log } from '../utils/logger';
import { NGROK_TUNNEL_URL } from '../config/env';

export interface JobMetadata {
  jobTitle: string;
  jobTitleShorthand: string;
  Company: string;
  jobURL: string;
  resumeURL: string;
  thirdPersonBlurb: string;
}

const CACHE_TTL = 300; // 5 minutes — short TTL for active debugging; raise to 21600 (6h) for production

const parseJsonSafely = (text: string, context: string): Record<string, string> | null => {
  if (text.trimStart().startsWith('<')) {
    log('ERROR', '%s — server returned HTML instead of JSON (tunnel down?): %s', context, text.slice(0, 120));
    return null;
  }
  try {
    return JSON.parse(text) as Record<string, string>;
  } catch (e) {
    log('ERROR', '%s — JSON parse failed: %s | body: %s', context, e, text.slice(0, 200));
    return null;
  }
};

const generateThirdPersonBlurb = (baseUrl: string, jobId: string): string | null => {
  log('INFO', 'Calling /generate-blurb for %s', jobId);
  let response: GoogleAppsScript.URL_Fetch.HTTPResponse;
  try {
    response = UrlFetchApp.fetch(`${baseUrl}/generate-blurb`, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'ngrok-skip-browser-warning': '1' },
      payload: JSON.stringify({ jobId }),
      muteHttpExceptions: true,
    });
  } catch (e) {
    log('ERROR', 'Network error calling /generate-blurb for %s: %s', jobId, e);
    return null;
  }

  log('DEBUG', '/generate-blurb response code: %s', response.getResponseCode());

  if (response.getResponseCode() !== 200) {
    log('ERROR', '/generate-blurb failed [%s]: %s', response.getResponseCode(), response.getContentText());
    return null;
  }

  const result = parseJsonSafely(response.getContentText(), `/generate-blurb ${jobId}`);
  if (!result) return null;

  if (!result['success']) {
    log('WARN', '/generate-blurb error for %s: %s', jobId, result['error']);
    return null;
  }

  log('INFO', 'Blurb generated for %s (%s chars)', jobId, String(result['blurb']?.length ?? 0));
  return result['blurb'] ?? null;
};

/** Probe the metadata server before a bulk send. Returns null when healthy, else a human-readable reason.
 *  Cheap (one GET) and deliberately not cached — the whole point is to catch a tunnel that just went down. */
export const checkMetadataServer = (): string | null => {
  if (!NGROK_TUNNEL_URL) {
    return 'NGROK_TUNNEL_URL is not set in .env — rebuild and redeploy before sending.';
  }

  let response: GoogleAppsScript.URL_Fetch.HTTPResponse;
  try {
    response = UrlFetchApp.fetch(`${NGROK_TUNNEL_URL}/health`, {
      method: 'get',
      headers: { 'ngrok-skip-browser-warning': '1' },
      muteHttpExceptions: true,
    });
  } catch (e) {
    return `Cannot reach ${NGROK_TUNNEL_URL} — is unified-server running? (${e})`;
  }

  if (response.getResponseCode() !== 200) {
    return `${NGROK_TUNNEL_URL}/health returned ${response.getResponseCode()} — is unified-server running?`;
  }

  if (!parseJsonSafely(response.getContentText(), '/health')) {
    return `${NGROK_TUNNEL_URL}/health did not return JSON — tunnel is up but not pointed at unified-server.`;
  }

  return null;
};

export const getJobMetadata = (jobId: string): JobMetadata | null => {
  if (!jobId) return null;

  const cache = CacheService.getScriptCache();
  const cached = cache.get(`job_${jobId}`);
  if (cached) {
    log('DEBUG', 'Cache hit for job %s', jobId);
    return JSON.parse(cached) as JobMetadata;
  }

  const baseUrl = NGROK_TUNNEL_URL;
  if (!baseUrl) {
    log('ERROR', 'NGROK_TUNNEL_URL not set in .env — rebuild required, cannot fetch metadata for %s', jobId);
    return null;
  }

  const url = `${baseUrl}/llm?jobID=${encodeURIComponent(jobId)}`;
  log('INFO', 'Fetching job metadata for %s — URL: %s', jobId, url);
  let response: GoogleAppsScript.URL_Fetch.HTTPResponse;
  try {
    response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { 'ngrok-skip-browser-warning': '1' },
      muteHttpExceptions: true,
    });
  } catch (e) {
    log('ERROR', 'Network error fetching job metadata for %s: %s', jobId, e);
    return null;
  }

  log('DEBUG', '/llm response code for %s: %s', jobId, response.getResponseCode());

  if (response.getResponseCode() !== 200) {
    log('ERROR', 'Job metadata fetch failed [%s] for %s: %s', response.getResponseCode(), jobId, response.getContentText().slice(0, 200));
    return null;
  }

  const data = parseJsonSafely(response.getContentText(), `/llm ${jobId}`);
  if (!data) return null;

  if (data['success'] === false as unknown) {
    log('WARN', 'Job metadata error for %s: %s', jobId, data['error']);
    return null;
  }

  let thirdPersonBlurb = data['third-person-blurb'] ?? '';

  if (!thirdPersonBlurb) {
    log('INFO', 'No third-person blurb for %s — triggering generation (may take ~30s)', jobId);
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
  log('INFO', 'Job metadata cached for %s (company: %s)', jobId, meta.Company);
  return meta;
};

export const clearJobMetadataCache = (jobId: string): void => {
  CacheService.getScriptCache().remove(`job_${jobId}`);
  log('INFO', 'Cache cleared for job %s', jobId);
};

// EnrichLayer profile enrichment + Claude-powered Zeitgeisty string generation.

import { NGROK_TUNNEL_URL } from '../config/env';
import { SCRIPT_PROPS } from '../config/settings';

type FetchFn = (url: string, opts: object) => { getContentText(): string };

// ── Staleness guard ───────────────────────────────────────────────────────────

const activityAgeDays = (activityUrl: string): number | null => {
  const idMatch = activityUrl.match(/activity[:/](\d+)/);
  if (!idMatch?.[1]) return null;
  // Activity IDs are Unix-epoch snowflakes: id / 4194304 = ms since 1970-01-01.
  return Math.floor((Date.now() - Math.floor(parseFloat(idMatch[1]) / 4194304)) / 86400000);
};

// ── Browser scraper (primary) ─────────────────────────────────────────────────

const fetchMostRecentPostViaBrowser = (
  linkedInUrl: string,
): { text: string; activityUrl: string } | null => {
  if (!NGROK_TUNNEL_URL) return null;
  const resp = UrlFetchApp.fetch(`${NGROK_TUNNEL_URL}/get-most-recent-linkedin-post`, {
    method: 'post',
    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
    payload: JSON.stringify({ profileUrl: linkedInUrl }),
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() !== 200) {
    console.log(`[BrowserScraper] ${resp.getResponseCode()}: ${resp.getContentText().slice(0, 200)}`);
    return null;
  }
  return JSON.parse(resp.getContentText()) as { text: string; activityUrl: string };
};

// ── EnrichLayer fallback ──────────────────────────────────────────────────────

const fetchMostRecentPostViaEnrichLayer = (linkedInUrl: string): string => {
  const apiKey = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.ENRICH_LAYER_API_KEY);
  console.log(`[EnrichLayer] fetching for ${linkedInUrl} apiKey=${apiKey ? 'set' : 'MISSING'}`);
  if (!apiKey) { console.log('ENRICH_LAYER_API_KEY not set'); return ''; }

  const url = `https://enrichlayer.com/api/v2/profile?profile_url=${encodeURIComponent(linkedInUrl)}&fallback_to_cache=on-error`;
  const resp = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { Authorization: `Bearer ${apiKey}` },
    muteHttpExceptions: true,
  });

  if (resp.getResponseCode() !== 200) {
    console.log(`EnrichLayer ${resp.getResponseCode()}: ${resp.getContentText()}`);
    return '';
  }

  const data = JSON.parse(resp.getContentText()) as Record<string, unknown>;
  const activities = (data.activities ?? []) as Record<string, unknown>[];
  if (!activities.length) return '';

  const latest = activities[0]!;
  const link = String(latest.link ?? '');
  const ageDays = activityAgeDays(link);
  if (ageDays !== null) {
    if (ageDays > 30) {
      console.log(`[EnrichLayer] most recent post is ${ageDays}d old — skipping Zeitgeisty`);
      return '';
    }
    console.log(`[EnrichLayer] most recent post is ${ageDays}d old`);
  }

  const postText = String(latest.title ?? '').trim();
  console.log(`[EnrichLayer] post url=${link || 'none'} text="${postText.slice(0, 150)}"`);
  return postText;
};

// ── Public entry point ────────────────────────────────────────────────────────

/** Returns the most recent LinkedIn post text for enrichment, or '' to skip. */
export const fetchMostRecentPost = (linkedInUrl: string): string => {
  // Primary: browser scrape via unified-server (full post text)
  const browser = fetchMostRecentPostViaBrowser(linkedInUrl);
  if (browser?.text) {
    const ageDays = activityAgeDays(browser.activityUrl);
    if (ageDays !== null) {
      if (ageDays > 30) {
        console.log(`[BrowserScraper] most recent post is ${ageDays}d old — skipping Zeitgeisty`);
        return '';
      }
      console.log(`[BrowserScraper] post is ${ageDays}d old`);
    }
    console.log(`[BrowserScraper] url=${browser.activityUrl} text="${browser.text.slice(0, 150)}"`);
    return browser.text;
  }
  // Fallback: EnrichLayer (truncated title; works without unified-server running)
  console.log('[BrowserScraper] no result — falling back to EnrichLayer');
  return fetchMostRecentPostViaEnrichLayer(linkedInUrl);
};

/** Calls Claude Haiku to produce a single-sentence comment or question based on a recent post. */
export const generateZeitgeistyString = (
  postText: string,
  firstName: string,
  fetchFn: FetchFn,
): string => {
  const apiKey = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.ANTHROPIC_API_KEY);
  console.log(`[Claude] generating for ${firstName} apiKey=${apiKey ? 'set' : 'MISSING'} postLen=${postText.length}`);
  if (!apiKey || !postText) return '';

  const prompt = `Based on this recent LinkedIn post by ${firstName}, write a single sentence — a genuine comment or question of anywhere between 45 and 75 characters — to open a conversation. Sound curious and human, not salesy.\n\nPost: "${postText}"\n\nReturn only the single sentence, nothing else.`;

  const resp = fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'post',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    payload: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
    }),
    muteHttpExceptions: true,
  });

  const data = JSON.parse(resp.getContentText()) as { content: { text: string }[] };
  const result = data.content?.[0]?.text?.trim() ?? '';
  console.log(`[Claude] result: "${result}"`);
  return result;
};

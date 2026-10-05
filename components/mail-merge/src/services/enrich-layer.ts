// LinkedIn activity scraper (via unified-server Playwright route) + Claude Zeitgeisty generator.

import { NGROK_TUNNEL_URL } from '../config/env';
import { SCRIPT_PROPS } from '../config/settings';
import { randomSleep, LINKEDIN_PACING_MS } from '../utils/delay';

type FetchFn = (url: string, opts: object) => { getContentText(): string };

// ── Helpers ───────────────────────────────────────────────────────────────────

// Activity IDs are Unix-epoch snowflakes: id / 4194304 = ms since 1970-01-01.
const activityAgeDays = (activityUrl: string): number | null => {
  const idMatch = activityUrl.match(/activity[:/](\d+)/);
  if (!idMatch?.[1]) return null;
  return Math.floor((Date.now() - Math.floor(parseFloat(idMatch[1]) / 4194304)) / 86400000);
};

// ── Browser scraper ───────────────────────────────────────────────────────────

const fetchMostRecentPostViaBrowser = (
  linkedInUrl: string,
): { text: string; activityUrl: string } | null => {
  if (!NGROK_TUNNEL_URL) {
    console.log('[BrowserScraper] NGROK_TUNNEL_URL not set — rebuild required');
    return null;
  }
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

// ── Public entry point ────────────────────────────────────────────────────────

export interface RecentPost {
  text: string;
  url: string;
}

/** Returns the most recent LinkedIn post (text + URL) for Zeitgeisty enrichment, or empty strings to skip. */
export const fetchMostRecentPost = (linkedInUrl: string): RecentPost => {
  const empty: RecentPost = { text: '', url: '' };
  const browser = fetchMostRecentPostViaBrowser(linkedInUrl);
  if (!browser?.text) {
    console.log('[BrowserScraper] no result — skipping Zeitgeisty');
    return empty;
  }

  const ageDays = activityAgeDays(browser.activityUrl);
  if (ageDays !== null) {
    if (ageDays > 30) {
      console.log(`[BrowserScraper] most recent post is ${ageDays}d old — skipping Zeitgeisty`);
      return empty;
    }
    console.log(`[BrowserScraper] post is ${ageDays}d old`);
  }

  randomSleep(LINKEDIN_PACING_MS.min, LINKEDIN_PACING_MS.max);

  console.log(`[BrowserScraper] url=${browser.activityUrl} text="${browser.text.slice(0, 150)}"`);
  return { text: browser.text, url: browser.activityUrl };
};

// ── Claude Zeitgeisty generator ───────────────────────────────────────────────

export interface ZeitgeistyGeneration {
  prompt: string;
  result: string;
}

/** Calls Claude Haiku to produce a single-sentence comment or question based on a recent post. */
export const generateZeitgeistyString = (
  postText: string,
  firstName: string,
  fetchFn: FetchFn,
): ZeitgeistyGeneration => {
  const apiKey = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROPS.ANTHROPIC_API_KEY);
  console.log(`[Claude] generating for ${firstName} apiKey=${apiKey ? 'set' : 'MISSING'} postLen=${postText.length}`);
  if (!apiKey || !postText) return { prompt: '', result: '' };

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
  return { prompt, result };
};

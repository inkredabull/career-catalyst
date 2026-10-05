// EnrichLayer profile enrichment + Claude-powered Zeitgeisty string generation.

import { SCRIPT_PROPS } from '../config/settings';

type FetchFn = (url: string, opts: object) => { getContentText(): string };

/** Fetches the LinkedIn profile via EnrichLayer and returns the most recent post text, or ''. */
export const fetchMostRecentPost = (linkedInUrl: string): string => {
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
  const postText = String(latest.title ?? '').trim();
  console.log(`[EnrichLayer] post url=${latest.link ?? 'none'} text="${postText.slice(0, 150)}"`);
  return postText;
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

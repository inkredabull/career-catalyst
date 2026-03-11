// Pure logic for outreach message generation.
// GAS-specific I/O (UrlFetchApp, PropertiesService) is injected so this
// module can also be unit-tested with jest outside of GAS.

export interface OutreachContext {
  contactName: string;
  contactRole: string;
  company: string;
  jobTitle?: string;
  notes?: string;
}

export interface GeneratedMessage {
  subject: string;
  body: string;
}

export type FetchFn = (url: string, options: object) => { getContentText(): string };

export function buildOutreachPrompt(ctx: OutreachContext): string {
  return [
    `Write a concise, personalized outreach message to ${ctx.contactName},`,
    `${ctx.contactRole} at ${ctx.company}.`,
    ctx.jobTitle ? `I am interested in the ${ctx.jobTitle} role.` : '',
    ctx.notes ? `Additional context: ${ctx.notes}` : '',
    'Return JSON: { "subject": "...", "body": "..." }',
  ]
    .filter(Boolean)
    .join(' ');
}

export function parseMessageResponse(responseText: string): GeneratedMessage {
  const match = responseText.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in LLM response');
  return JSON.parse(match[0]) as GeneratedMessage;
}

export function generateOutreachMessage(
  ctx: OutreachContext,
  apiKey: string,
  fetchFn: FetchFn
): GeneratedMessage {
  const prompt = buildOutreachPrompt(ctx);
  const response = fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'post',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    payload: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = JSON.parse(response.getContentText()) as {
    content: Array<{ text: string }>;
  };
  return parseMessageResponse(data.content[0].text);
}

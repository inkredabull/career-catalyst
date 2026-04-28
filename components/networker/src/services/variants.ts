/**
 * Message variant generation via Anthropic Claude API.
 * Ported from network-followups/VariantService — GAS deps replaced with axios + dotenv.
 */

import axios from 'axios';
import { MessageVariants } from '../types.js';
import { CLAUDE_MODEL } from '../config.js';

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
  error?: { message: string };
}

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set. Add it to your .env file.');
  return key;
}

async function callClaude(prompt: string): Promise<string> {
  const { data } = await axios.post<AnthropicResponse>(
    'https://api.anthropic.com/v1/messages',
    {
      model: CLAUDE_MODEL,
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': getApiKey(),
        'anthropic-version': '2023-06-01',
      },
    }
  );

  if (data.error) throw new Error(`Claude API error: ${data.error.message}`);

  const first = data.content[0];
  if (!first || first.type !== 'text') throw new Error('Unexpected response format from Claude');
  return first.text.trim();
}

/**
 * Generates two reworded variants of a personalised LinkedIn outreach message.
 * Falls back to the original message if parsing fails.
 */
export async function generateVariants(
  originalMessage: string,
  contactName: string
): Promise<MessageVariants> {
  const prompt = `You are helping reword a personalized LinkedIn outreach message for a follow-up connection attempt.

The original message sent to ${contactName} was:
"${originalMessage}"

Generate exactly TWO alternative versions of this message. Each version should:
- Preserve all specific personal details, names, and context from the original
- Keep the same casual, human tone
- Be slightly different in phrasing/structure (not just synonym swaps)
- Be appropriate length for a LinkedIn connection note (under 300 characters preferred)
- Feel genuine, not templated

Return ONLY the two messages in this exact format with no other text:
VARIANT_1: [first reworded message]
VARIANT_2: [second reworded message]`;

  const raw = await callClaude(prompt);

  const v1Match = raw.match(/VARIANT_1:\s*(.+?)(?=VARIANT_2:|$)/s);
  const v2Match = raw.match(/VARIANT_2:\s*(.+?)$/s);

  return {
    variant1: v1Match?.[1]?.trim().replace(/^["']|["']$/g, '') ?? originalMessage,
    variant2: v2Match?.[1]?.trim().replace(/^["']|["']$/g, '') ?? originalMessage,
  };
}

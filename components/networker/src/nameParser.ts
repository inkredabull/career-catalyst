/** Ported from meetup-networker/nameParser.ts — no changes. */

export interface ParsedName {
  original: string;
  firstName?: string;
  lastName?: string;
  isValid: boolean;
}

export function parseName(nameStr: string): ParsedName {
  const trimmed = nameStr.trim();
  if (!trimmed) return { original: nameStr, isValid: false };

  const parts = trimmed.split(/\s+/).filter(p => p.length > 0);
  if (parts.length < 2) return { original: nameStr, isValid: false };

  return {
    original: nameStr,
    firstName: parts[0],
    lastName: parts[parts.length - 1],
    isValid: true,
  };
}

export function parseNameList(content: string): ParsedName[] {
  return content
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map(parseName);
}

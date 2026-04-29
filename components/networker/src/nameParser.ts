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
  // One-word entries (handles "LinkedIn Member", single slugs, etc.)
  if (parts.length < 2) return { original: nameStr, isValid: false };

  return {
    original: nameStr,
    firstName: parts[0],
    lastName: parts[parts.length - 1],
    isValid: true,
  };
}

function getOwnName(): string {
  return (process.env.NETWORKER_OWN_NAME ?? '').trim().toLowerCase();
}

export function parseNameList(content: string): ParsedName[] {
  const ownName = getOwnName();
  return content
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map(parseName)
    .filter(p => {
      if (!p.isValid) return false;
      if (ownName && p.original.trim().toLowerCase() === ownName) return false;
      return true;
    });
}

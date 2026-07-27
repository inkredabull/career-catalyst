export interface ParsedName {
  original: string;
  firstName?: string;
  lastName?: string;
  isValid: boolean;
  reason?: string;
}

const INITIAL_PATTERN = /^[A-Za-z]\.?$/;

export function parseName(nameStr: string): ParsedName {
  const trimmed = nameStr.trim();
  if (!trimmed) return { original: nameStr, isValid: false };

  const parts = trimmed.split(/\s+/).filter(p => p.length > 0);
  // One-word entries (handles "LinkedIn Member", single slugs, etc.)
  if (parts.length < 2) return { original: nameStr, isValid: false };

  const lastName = parts[parts.length - 1];
  // A single-letter "last name" (e.g. "Aakash S") is too ambiguous to search/cache
  // reliably — EnrichLayer treats it as a wildcard and can match the wrong person.
  if (INITIAL_PATTERN.test(lastName)) {
    return { original: nameStr, isValid: false, reason: 'last name is only an initial' };
  }

  return {
    original: nameStr,
    firstName: parts[0],
    lastName,
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

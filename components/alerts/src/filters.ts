import { INCLUDE_PATTERNS, EXCLUDE_PATTERNS } from './config/titles';

export function titlePassesPatterns(title: string): boolean {
  if (EXCLUDE_PATTERNS.some(re => re.test(title))) return false;
  if (INCLUDE_PATTERNS.length > 0 && !INCLUDE_PATTERNS.some(re => re.test(title))) return false;
  return true;
}

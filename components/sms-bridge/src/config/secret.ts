import fs from 'fs';
import path from 'path';

/** Env var that overrides the dotfile. Useful for CI and hosted runtimes. */
export const SECRET_ENV_VAR = 'SMS_BRIDGE_SECRET';

/** Gitignored dotfile at the repo root holding the shared secret. */
export const SECRET_FILENAME = '.sms-bridge-secret';

/**
 * Repo root, four levels up from this file.
 *
 * Holds for both the compiled and the ts-jest path, since dist/ and src/ sit
 * at the same depth: {dist,src}/config -> {dist,src} -> sms-bridge ->
 * components -> repo root.
 */
function repoRoot(): string {
  return path.resolve(__dirname, '..', '..', '..', '..');
}

/** First non-blank, non-comment line of the dotfile. */
export function parseSecretFile(contents: string): string | null {
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) return trimmed;
  }
  return null;
}

/**
 * Resolve the shared secret, env var first, then the dotfile.
 *
 * Returns null when nothing is configured — callers must fail closed rather
 * than treat that as "auth disabled".
 */
export function loadSendSecret(): string | null {
  const fromEnv = process.env[SECRET_ENV_VAR]?.trim();
  if (fromEnv) return fromEnv;

  try {
    const contents = fs.readFileSync(path.join(repoRoot(), SECRET_FILENAME), 'utf8');
    return parseSecretFile(contents);
  } catch {
    return null;
  }
}

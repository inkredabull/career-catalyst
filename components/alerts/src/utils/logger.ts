export type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
const LEVELS: Record<Level, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

function currentLevel(): number {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('LOG_LEVEL') ?? 'INFO';
    return LEVELS[raw.toUpperCase() as Level] ?? LEVELS.INFO;
  } catch {
    return LEVELS.INFO;
  }
}

export function log(level: Level, msg: string, ...args: unknown[]): void {
  if (LEVELS[level] < currentLevel()) return;
  /* eslint-disable no-console */
  if      (level === 'DEBUG') console.debug(msg, ...args);
  else if (level === 'WARN')  console.warn(msg, ...args);
  else if (level === 'ERROR') console.error(msg, ...args);
  else                        console.log(msg, ...args);
}

// Leveled logger for GAS. Set LOG_LEVEL Script Property to TRACE/DEBUG/INFO/WARN/ERROR (default: INFO).
// TRACE is the most verbose — use it for chatty sub-step detail (e.g. SMS/LinkedIn branching)
// that's too noisy for routine DEBUG output.

type Level = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LEVELS: Record<Level, number> = { TRACE: 0, DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4 };

const getMinLevel = (): number => {
  const prop = PropertiesService.getScriptProperties().getProperty('LOG_LEVEL') ?? 'INFO';
  return LEVELS[(prop.toUpperCase() as Level)] ?? LEVELS.INFO;
};

export const log = (level: Level, msg: string, ...args: unknown[]): void => {
  if (LEVELS[level] >= getMinLevel()) {
    console.log(`[${level}] ${msg}`, ...args);
  }
};

// Leveled logger for GAS. Set LOG_LEVEL Script Property to DEBUG/INFO/WARN/ERROR (default: INFO).

type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LEVELS: Record<Level, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

const getMinLevel = (): number => {
  const prop = PropertiesService.getScriptProperties().getProperty('LOG_LEVEL') ?? 'INFO';
  return LEVELS[(prop.toUpperCase() as Level)] ?? LEVELS.INFO;
};

export const log = (level: Level, msg: string, ...args: unknown[]): void => {
  if (LEVELS[level] >= getMinLevel()) {
    Logger.log(`[${level}] ${msg}`, ...args);
  }
};

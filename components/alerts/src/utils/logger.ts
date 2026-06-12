export type Level = "DEBUG" | "INFO" | "WARN" | "ERROR";
const LEVELS: Record<Level, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

const buffer: string[] = [];

function currentLevel(): number {
  const raw = process.env["LOG_LEVEL"] ?? "INFO";
  return LEVELS[raw.toUpperCase() as Level] ?? LEVELS.INFO;
}

function formatLine(level: Level, msg: string, args: unknown[]): string {
  const filled = args.reduce<string>((s, a) => s.replace("%s", String(a)), msg);
  return `[${level}] ${filled}`;
}

export function log(level: Level, msg: string, ...args: unknown[]): void {
  const line = formatLine(level, msg, args);
  buffer.push(line);
  if (LEVELS[level] < currentLevel()) return;
  /* eslint-disable no-console */
  if (level === "WARN") console.warn(line);
  else if (level === "ERROR") console.error(line);
  else console.log(line);
}

export function flushLogs(): string[] {
  return [...buffer];
}

export function clearLogs(): void {
  buffer.length = 0;
}

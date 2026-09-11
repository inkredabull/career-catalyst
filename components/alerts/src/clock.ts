import { log } from "./utils/logger";

export function randomIntFromInterval(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

/**
 * Parse a LinkedIn-style time-frame string ("r86400") to seconds.
 * Falls back to 24h for anything unparseable.
 */
export function timeFrameToSeconds(timeFrame: string): number {
  const seconds = parseInt(timeFrame.replace(/^r/, ""), 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 86400;
}

/** Epoch-ms cutoff for a time-frame string: jobs published before this are stale. */
export function timeFrameToCutoffMs(timeFrame: string, now?: number): number {
  return (now ?? Date.now()) - timeFrameToSeconds(timeFrame) * 1000;
}

export async function pause(minimum?: number): Promise<void> {
  const MIN_IN_MILLIS = minimum ?? 1250;
  const msToSleep = randomIntFromInterval(MIN_IN_MILLIS, MIN_IN_MILLIS + 1500);
  log("DEBUG", "Sleeping %s ms", msToSleep);
  await new Promise((resolve) => setTimeout(resolve, msToSleep));
}

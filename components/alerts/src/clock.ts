import { log } from "./utils/logger";

export function randomIntFromInterval(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

export async function pause(minimum?: number): Promise<void> {
  const MIN_IN_MILLIS = minimum ?? 1250;
  const msToSleep = randomIntFromInterval(MIN_IN_MILLIS, MIN_IN_MILLIS + 1500);
  log("DEBUG", "Sleeping %s ms", msToSleep);
  await new Promise((resolve) => setTimeout(resolve, msToSleep));
}

import { log } from './utils/logger';

export function randomIntFromInterval(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

export function pause(minimum?: number): void {
  const MIN_IN_MILLIS = minimum ?? 1250;
  const msToSleep = randomIntFromInterval(MIN_IN_MILLIS, MIN_IN_MILLIS + 1500);
  log('DEBUG', 'Sleeping %s ms', msToSleep);
  Utilities.sleep(msToSleep);
}

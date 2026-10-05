// Named constants capture the LinkedIn interaction pacing range used across this repo.
export const LINKEDIN_PACING_MS = { min: 1600, max: 3750 } as const;

export const randomSleep = (min: number, max: number): void =>
  Utilities.sleep(Math.floor(Math.random() * (max - min + 1)) + min);

import readline from 'readline';

/**
 * Pauses for the user to review/edit a file on disk, then resolves on Enter.
 * Deliberately NOT gated by LLM_AUTO_CONFIRM — that flag silences cost
 * confirmations, but this pause is the whole point of a review step; callers
 * that want to skip it entirely should use an explicit opt-out flag instead.
 */
export async function pauseForFileReview(filePath: string, label: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  await new Promise<void>((resolve) => {
    rl.question(`\n📝 Review/edit ${label} at ${filePath}, then press Enter to continue...`, () => {
      rl.close();
      resolve();
    });
  });
}

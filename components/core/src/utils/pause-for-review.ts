import readline from 'readline';
import { getLLMAutoConfirm } from '../config';

/**
 * Pauses for the user to review/edit a file on disk, then resolves on Enter.
 * Skipped entirely when LLM_AUTO_CONFIRM is set, same convention as confirmCost.
 */
export async function pauseForFileReview(filePath: string, label: string): Promise<void> {
  if (getLLMAutoConfirm()) {
    return;
  }

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

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';

export type ShellRunner = (cmd: string, opts?: Record<string, unknown>) => string;
export type ScriptRunner = (script: string, opts?: Record<string, unknown>) => void;

const defaultShell: ShellRunner = (cmd, opts) =>
  execSync(cmd, { encoding: 'utf-8', ...opts }) as unknown as string;

const defaultScript: ScriptRunner = (script, opts) => {
  execSync('osascript', { input: script, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });
};

export function countTabs(runner: ShellRunner = defaultShell): number {
  try {
    const result = runner(
      `osascript -e 'tell application "Google Chrome" to count tabs of front window'`
    );
    return parseInt(String(result).trim(), 10);
  } catch {
    return 0;
  }
}

export function openTab(url: string, runner: ShellRunner = defaultShell): void {
  runner(`open -a "Google Chrome" ${JSON.stringify(url)}`);
}

export function closeTab(tabIndex: number, scriptRunner: ScriptRunner = defaultScript): void {
  scriptRunner(`tell application "Google Chrome" to close tab ${tabIndex} of front window`);
}

export function injectScript(
  tabIndex: number,
  javascript: string,
  scriptRunner: ScriptRunner = defaultScript
): void {
  const tmpFile = `/tmp/cc_inject_${Date.now()}.js`;
  writeFileSync(tmpFile, javascript, 'utf-8');
  const appleScript = `
set jsCode to read POSIX file "${tmpFile}"
tell application "Google Chrome"
  tell tab ${tabIndex} of front window
    execute javascript jsCode
  end tell
end tell`;
  try {
    scriptRunner(appleScript);
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

export async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

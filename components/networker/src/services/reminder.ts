/** reminder: creates a macOS Reminders.app task via AppleScript (args passed via argv, never interpolated). */

import { execFileSync } from 'child_process';

export const DEFAULT_REMINDER_LIST = '2. Build with purpose';

export function createReminder(opts: { list?: string; title: string; body: string }): void {
  const script = `
on run argv
  tell application "Reminders"
    set theList to list (item 1 of argv)
    tell theList to make new reminder with properties {name:(item 2 of argv), body:(item 3 of argv), due date:(current date)}
  end tell
end run`;
  execFileSync('osascript', ['-', opts.list ?? DEFAULT_REMINDER_LIST, opts.title, opts.body], {
    input: script,
    encoding: 'utf-8',
  });
}

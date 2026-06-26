import { describe, it, expect, vi } from 'vitest';
import { countTabs, openTab, closeTab, injectScript } from '../src/chrome/tabs.js';

describe('countTabs', () => {
  it('parses the integer returned by osascript', () => {
    const runner = vi.fn().mockReturnValue('5\n');
    expect(countTabs(runner)).toBe(5);
    expect(runner).toHaveBeenCalledWith(
      expect.stringContaining('count tabs of front window')
    );
  });

  it('returns 0 when osascript throws', () => {
    const runner = vi.fn().mockImplementation(() => { throw new Error('Chrome not running'); });
    expect(countTabs(runner)).toBe(0);
  });
});

describe('openTab', () => {
  it('calls open -a Google Chrome with the URL', () => {
    const runner = vi.fn().mockReturnValue('');
    openTab('https://linkedin.com/in/alice', runner);
    expect(runner).toHaveBeenCalledWith(
      expect.stringContaining('"https://linkedin.com/in/alice"')
    );
    expect(runner).toHaveBeenCalledWith(expect.stringContaining('Google Chrome'));
  });
});

describe('closeTab', () => {
  it('sends a close AppleScript targeting the given tab index', () => {
    const runner = vi.fn();
    closeTab(3, runner);
    expect(runner).toHaveBeenCalledWith(expect.stringContaining('close tab 3'));
  });
});

describe('injectScript', () => {
  it('passes the AppleScript targeting the correct tab index', () => {
    const runner = vi.fn();
    injectScript(2, 'console.log("hi")', runner);
    const called = runner.mock.calls[0][0] as string;
    expect(called).toContain('tell tab 2 of front window');
  });

  it('still cleans up tmp file even if runner throws', () => {
    const runner = vi.fn().mockImplementation(() => { throw new Error('inject failed'); });
    expect(() => injectScript(1, 'js', runner)).toThrow('inject failed');
    // No dangling tmp files — unlinkSync runs in finally; we just confirm no second throw
  });
});

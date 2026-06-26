import { describe, it, expect } from 'vitest';
import { generateConnectScript } from '../src/scripts/connect.js';

describe('generateConnectScript', () => {
  it('embeds the message into the script', () => {
    const script = generateConnectScript('Hi Alice!');
    expect(script).toContain(JSON.stringify('Hi Alice!'));
  });

  it('returns a self-invoking async function', () => {
    const script = generateConnectScript('test');
    expect(script.trim()).toMatch(/^\(async function\(\)/);
    expect(script.trim()).toMatch(/\(\);$/s);
  });

  it('escapes special characters in the message safely', () => {
    const msg = 'Hi "Bob" & <Alice>';
    const script = generateConnectScript(msg);
    expect(script).toContain(JSON.stringify(msg));
  });

  it('includes pending-check guard', () => {
    expect(generateConnectScript('x')).toContain("'pending'");
  });

  it('includes "Add a note" polling logic', () => {
    expect(generateConnectScript('x')).toContain('add a note');
  });

  it('includes textarea native setter', () => {
    expect(generateConnectScript('x')).toContain('HTMLTextAreaElement.prototype');
  });
});

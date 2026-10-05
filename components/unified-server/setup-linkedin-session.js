#!/usr/bin/env node
// One-time setup: opens a real browser window so you can log in to LinkedIn.
// The session is saved to .linkedin-profile/ and reused headlessly by the server.
// Run again to refresh an expired session.

const { chromium } = require('playwright');
const path = require('path');

const PROFILE_DIR = path.join(__dirname, '.linkedin-profile');

(async () => {
  console.log('Opening browser — log in to LinkedIn, then close the window.');
  console.log(`Session will be saved to: ${PROFILE_DIR}`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: ['--start-maximized'],
  });
  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/login');

  // timeout: 0 = wait indefinitely until the user closes the browser window
  await context.waitForEvent('close', { timeout: 0 });
  console.log('Session saved. You can now start the unified-server normally.');
})();

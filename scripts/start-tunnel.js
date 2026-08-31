#!/usr/bin/env node
'use strict';

/**
 * Starts an ngrok tunnel to localhost:3000 (unified-server) and writes
 * the public URL to NGROK_TUNNEL_URL in .env so every other tool that
 * reads the file picks it up on the next restart.
 *
 * Requires NGROK_AUTHTOKEN in the environment (or already set via
 * `ngrok config add-authtoken`).
 */

const ngrok = require('@ngrok/ngrok');
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.resolve(__dirname, '..', '.env');
const PORT = 3000;
const KEY = 'NGROK_TUNNEL_URL';

function patchEnv(url) {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const line = `${KEY}=${url}`;
  const re = new RegExp(`^${KEY}=.*$`, 'm');
  if (re.test(content)) {
    content = content.replace(re, line);
  } else {
    content = content.trimEnd() + '\n' + line + '\n';
  }
  fs.writeFileSync(ENV_PATH, content);
  console.log(`✅ ${KEY} written to .env`);
}

async function main() {
  const authtoken = process.env.NGROK_AUTHTOKEN;
  if (!authtoken) {
    console.warn('⚠️  NGROK_AUTHTOKEN not set — ngrok will use any saved auth from ~/.ngrok2/ngrok.yml');
  }

  console.log(`🚇 Opening ngrok tunnel → localhost:${PORT} …`);

  const listener = await ngrok.forward({
    addr: PORT,
    authtoken,
  });

  const url = listener.url();
  console.log(`🌐 Tunnel: ${url}`);
  patchEnv(url);
  console.log('   Keeping tunnel open — Ctrl+C to stop.');

  // Keep the process alive until interrupted.
  process.on('SIGINT', async () => {
    console.log('\n🛑 Closing tunnel…');
    await listener.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('❌ Tunnel failed:', err.message);
  process.exit(1);
});

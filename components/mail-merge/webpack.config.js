const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const GasPlugin = require('gas-webpack-plugin');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Shared secret for POST /send, from the gitignored root dotfile (or the env).
// Bundled at build time the same way NGROK_TUNNEL_URL is — GAS has no way to
// read repo files at runtime. Changing the secret means rebuilding + redeploying.
function readSendSecret() {
  if (process.env.SMS_BRIDGE_SECRET) return process.env.SMS_BRIDGE_SECRET.trim();
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, '../../.sms-bridge-secret'), 'utf8');
    const line = raw.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'));
    return line ?? '';
  } catch {
    return '';
  }
}

const SMS_BRIDGE_SECRET = readSendSecret();
if (!SMS_BRIDGE_SECRET) {
  console.warn(
    '⚠️  No .sms-bridge-secret found at the repo root — the built bundle will not ' +
      'be able to send SMS (unified-server will reject /send with 401).'
  );
}

module.exports = {
  entry: './src/index.ts',
  output: {
    filename: 'Code.js',
    path: path.resolve(__dirname, 'dist'),
    iife: false,
  },
  module: {
    rules: [{
      test: /\.ts$/,
      use: [{ loader: 'ts-loader', options: { configFile: 'tsconfig.webpack.json' } }],
      exclude: /node_modules/,
    }],
  },
  resolve: { extensions: ['.ts', '.js'] },
  plugins: [
    new GasPlugin(),
    new webpack.DefinePlugin({
      __NGROK_TUNNEL_URL__: JSON.stringify(process.env.NGROK_TUNNEL_URL ?? ''),
      __SMS_BRIDGE_SECRET__: JSON.stringify(SMS_BRIDGE_SECRET),
    }),
  ],
  optimization: {
    minimize: false,
    concatenateModules: true,
  },
  devtool: false,
};

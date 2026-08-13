#!/usr/bin/env node

/**
 * One-time script to get Google OAuth refresh token for Gmail and Sheets API
 * Run this after setting up OAuth credentials in GCP
 */

const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const { exec } = require('child_process');
require('dotenv').config();

const REDIRECT_URI = 'http://localhost:3002/oauth2callback';
const PORT = 3002;

// OAuth2 configuration
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
);

// Google API scopes
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
];

async function getRefreshToken() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error('❌ Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env file');
    console.error('Please set these values from your GCP OAuth credentials first.');
    console.error('');
    console.error('📝 Steps to get credentials:');
    console.error('   1. Go to https://console.cloud.google.com/apis/credentials');
    console.error('   2. Create OAuth 2.0 Client ID (Desktop app type)');
    console.error(`   3. Add ${REDIRECT_URI} as an authorized redirect URI`);
    console.error('   4. Copy Client ID and Client Secret to .env');
    process.exit(1);
  }

  // Generate auth URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // Force consent screen to get refresh token
  });

  console.log('🔐 Google API Authentication Setup');
  console.log('='.repeat(60));
  console.log('');
  console.log('📋 Scopes requested:');
  console.log('   • Gmail (read, compose, send) — ReachPilot drafts + digest');
  console.log('   • Sheets (read/write) — Warmup History + job tracking');
  console.log('   • Contacts (readonly) — Google People API sync');
  console.log('   • Drive metadata (readonly) — resolve resume PDF share links');
  console.log('');
  console.log('🚀 Starting local OAuth server on port', PORT);
  console.log('');
  console.log('1. Your browser will open automatically');
  console.log('2. Sign in with your Google account');
  console.log('3. Grant access to Gmail and Sheets');
  console.log('4. You\'ll be redirected back automatically');
  console.log('');
  console.log('If the browser doesn\'t open, visit this URL manually:');
  console.log(authUrl);
  console.log('');

  // Create a local server to receive the OAuth callback
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url.indexOf('/oauth2callback') > -1) {
        const qs = new url.URL(req.url, `http://localhost:${PORT}`).searchParams;
        const code = qs.get('code');

        if (!code) {
          res.end('❌ No authorization code received');
          server.close();
          process.exit(1);
        }

        console.log('');
        console.log('🔄 Exchanging authorization code for tokens...');

        // Exchange authorization code for tokens
        const { tokens } = await oauth2Client.getToken(code);

        console.log('');
        console.log('✅ Success! Authentication complete');
        console.log('');
        console.log('📝 Add this to your .env file:');
        console.log('');
        console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
        console.log('');
        console.log('Your .env file should now have:');
        console.log('');
        console.log(`GOOGLE_CLIENT_ID=${process.env.GOOGLE_CLIENT_ID}`);
        console.log(`GOOGLE_CLIENT_SECRET=${process.env.GOOGLE_CLIENT_SECRET}`);
        console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
        console.log('');
        console.log('🎯 You can now use:');
        console.log('   • npm run dev whogothired');
        console.log('   • ts-node scripts/test-sheets-integration.ts');
        console.log('');

        // Send success response to browser
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <head><title>Authentication Successful</title></head>
            <body style="font-family: system-ui; max-width: 600px; margin: 100px auto; text-align: center;">
              <h1 style="color: #10b981;">✅ Authentication Successful!</h1>
              <p style="font-size: 18px; color: #6b7280;">
                You can close this window and return to your terminal.
              </p>
              <p style="color: #9ca3af; margin-top: 40px;">
                Your refresh token has been generated.<br>
                Copy it from the terminal to your .env file.
              </p>
            </body>
          </html>
        `);

        // Close server after successful authentication
        setTimeout(() => {
          server.close();
          process.exit(0);
        }, 1000);
      }
    } catch (error) {
      console.error('');
      console.error('❌ Error during authentication:', error.message);
      res.end('❌ Authentication failed. Check the terminal for details.');
      server.close();
      process.exit(1);
    }
  });

  // Start server
  server.listen(PORT, () => {
    // Open browser automatically (cross-platform)
    const openCommand = process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
      ? 'start'
      : 'xdg-open';

    exec(`${openCommand} "${authUrl}"`, (error) => {
      if (error) {
        console.log('⚠️ Could not open browser automatically');
        console.log('   Please visit the URL above manually');
      }
    });
  });
}

getRefreshToken();

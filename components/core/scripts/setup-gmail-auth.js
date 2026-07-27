#!/usr/bin/env node

/**
 * One-time script to get Google OAuth refresh token for Gmail API
 * Run this after setting up OAuth credentials in GCP
 */

const { google } = require('googleapis');
const readline = require('readline');
require('dotenv').config();

// OAuth2 configuration
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob' // For desktop apps
);

// Gmail API scope - readonly access to Gmail; Drive scope - readonly access for resolving
// résumé Drive share links (see components/core/src/utils/google-drive.ts)
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.readonly'
];

async function getRefreshToken() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error('❌ Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env file');
    console.error('Please set these values from your GCP OAuth credentials first.');
    process.exit(1);
  }

  // Generate auth URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // Force consent screen to get refresh token
  });

  console.log('🔐 Gmail API Authentication Setup');
  console.log('='.repeat(50));
  console.log('');
  console.log('1. Open this URL in your browser:');
  console.log('');
  console.log(authUrl);
  console.log('');
  console.log('2. Sign in with your Google account');
  console.log('3. Grant access to Gmail and Drive (read-only)');
  console.log('4. Copy the authorization code and paste it below');
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('Enter the authorization code: ', async (code) => {
    rl.close();
    
    try {
      const { tokens } = await oauth2Client.getToken(code);
      
      console.log('');
      console.log('✅ Success! Add this to your .env file:');
      console.log('');
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log('');
      console.log('Your .env file should now look like:');
      console.log('');
      console.log(`GOOGLE_CLIENT_ID=${process.env.GOOGLE_CLIENT_ID}`);
      console.log(`GOOGLE_CLIENT_SECRET=${process.env.GOOGLE_CLIENT_SECRET}`);
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log('');
      console.log('🎯 You can now run: npm run dev whogothired');
      
    } catch (error) {
      console.error('❌ Error getting refresh token:', error.message);
      process.exit(1);
    }
  });
}

getRefreshToken();
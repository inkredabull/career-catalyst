import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

/**
 * Google Drive utility for resolving share links to files synced by Google Drive Desktop.
 */

function getOAuth2Client(): OAuth2Client {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  );

  if (process.env.GOOGLE_REFRESH_TOKEN) {
    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });
  }

  return oauth2Client;
}

/**
 * Polls the Drive API for a file with the given exact name, to account for the lag between
 * a local write and Google Drive Desktop syncing it. Returns a share link once found, or null
 * if it doesn't appear within the timeout.
 */
export async function findDriveFileLink(
  fileName: string,
  opts: { timeoutMs?: number; pollIntervalMs?: number } = {}
): Promise<string | null> {
  const { timeoutMs = 3 * 60_000, pollIntervalMs = 10_000 } = opts;

  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    throw new Error('GOOGLE_REFRESH_TOKEN not found. Run: npm run setup-gmail');
  }

  const drive = google.drive({ version: 'v3', auth: getOAuth2Client() });
  const escaped = fileName.replace(/'/g, "\\'");
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { data } = await drive.files.list({
      q: `name = '${escaped}' and trashed = false`,
      fields: 'files(id, webViewLink)',
      orderBy: 'modifiedTime desc',
      pageSize: 1,
    });

    const file = data.files?.[0];
    if (file?.id) return `https://drive.google.com/file/d/${file.id}/view`;

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  return null;
}

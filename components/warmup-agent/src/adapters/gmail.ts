import { google } from 'googleapis';

export interface GmailDraftResult {
  draftId: string;
  draftUrl: string;
  messageId?: string;
}

export class GmailDraftService {
  private gmail: ReturnType<typeof google.gmail>;

  constructor() {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob'
    );

    if (process.env.GOOGLE_REFRESH_TOKEN) {
      oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    }

    this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  }

  async createDraft(
    to: string,
    subject: string,
    bodyHtml: string,
    bodyText?: string
  ): Promise<GmailDraftResult> {
    if (!process.env.GOOGLE_REFRESH_TOKEN) {
      throw new Error('GOOGLE_REFRESH_TOKEN not set. Run: npm run setup-gmail (needs gmail.compose scope)');
    }

    const message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      bodyHtml || bodyText || '',
    ].join('\n');

    const encoded = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await this.gmail.users.drafts.create({
      userId: 'me',
      requestBody: { message: { raw: encoded } },
    });

    const draftId = response.data.id ?? '';
    const messageId = response.data.message?.id ?? undefined;
    const draftUrl = `https://mail.google.com/mail/u/0/#search/in:drafts+to:${encodeURIComponent(to)}`;

    return { draftId, draftUrl, messageId };
  }

  async sendEmail(to: string, subject: string, bodyText: string): Promise<void> {
    if (!process.env.GOOGLE_REFRESH_TOKEN) {
      throw new Error('GOOGLE_REFRESH_TOKEN not set');
    }

    const message = [`To: ${to}`, `Subject: ${subject}`, '', bodyText].join('\n');
    const encoded = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await this.gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded },
    });
  }
}

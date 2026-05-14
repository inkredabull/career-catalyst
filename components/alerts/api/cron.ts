import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getOpenReqs } from '../src/index';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env['CRON_SECRET']}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const webAppUrl = process.env['WEB_APP_URL'] ?? '';
  await getOpenReqs(webAppUrl);
  res.status(200).json({ ok: true });
}

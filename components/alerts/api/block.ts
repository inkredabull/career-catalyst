import type { VercelRequest, VercelResponse } from '@vercel/node';
import { addToStopList } from '../src/seen';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const type  = req.query['type'] as string | undefined;
  const value = req.query['value'] as string | undefined;

  if (!type || !value || (type !== 'company' && type !== 'title')) {
    res.status(400).send('<p>Missing or invalid parameters.</p>');
    return;
  }

  await addToStopList(type, value);

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(
    `<h2>✅ Blocked</h2><p><strong>${value}</strong> added to ${type} stop list.</p>`
  );
}

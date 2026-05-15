import type { VercelRequest, VercelResponse } from '@vercel/node';
import { addToStopList } from '../src/seen';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isValidType(t: unknown): t is 'company' | 'title' {
  return t === 'company' || t === 'title';
}

async function parseFormBody(req: VercelRequest): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => resolve(Object.fromEntries(new URLSearchParams(body))));
    req.on('error', reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Content-Type', 'text/html');

  if (req.method === 'GET') {
    const type  = req.query['type'] as string | undefined;
    const value = req.query['value'] as string | undefined;

    if (!isValidType(type) || !value) {
      res.status(400).send('<p>Missing or invalid parameters.</p>');
      return;
    }

    res.status(200).send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Block ${type}</title></head>
<body style="font-family:sans-serif;max-width:480px;margin:40px auto;padding:0 16px">
  <h2>Block ${type}</h2>
  <form method="POST">
    <input type="hidden" name="type" value="${escapeHtml(type)}" />
    <label style="display:block;margin-bottom:6px;font-size:14px;color:#555">
      Edit to a more general pattern before submitting:
    </label>
    <input type="text" name="value" value="${escapeHtml(value)}"
           autofocus
           style="width:100%;font-size:16px;padding:8px;box-sizing:border-box;border:1px solid #ccc;border-radius:4px" />
    <br><br>
    <button type="submit"
            style="font-size:16px;padding:8px 24px;background:#ef4444;color:#fff;border:none;border-radius:4px;cursor:pointer">
      Block
    </button>
  </form>
</body>
</html>`);
    return;
  }

  if (req.method === 'POST') {
    const body    = await parseFormBody(req);
    const type    = body['type'];
    const trimmed = body['value']?.trim();

    if (!isValidType(type) || !trimmed) {
      res.status(400).send('<p>Missing or invalid parameters.</p>');
      return;
    }

    await addToStopList(type, trimmed);

    res.status(200).send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Blocked</title></head>
<body style="font-family:sans-serif;max-width:480px;margin:40px auto;padding:0 16px">
  <h2>✅ Blocked</h2>
  <p><strong>${escapeHtml(trimmed)}</strong> added to ${escapeHtml(type)} stop list.</p>
</body>
</html>`);
    return;
  }

  res.status(405).send('<p>Method not allowed.</p>');
}

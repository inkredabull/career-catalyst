import { Router } from 'express';

import { UNIFIED_SERVER_URL } from '../config/env';

export const proxyRouter: Router = Router();

/**
 * Pass-throughs to components/unified-server.
 *
 * These exist so a single ngrok tunnel can front both processes: the tunnel
 * terminates here, and unified-server stays bound to localhost. Without them
 * you would need two tunnels and two URLs to keep in sync across the root
 * .env and the Vercel env var of the same name.
 */

function upstream(pathname: string, search: Record<string, unknown>): string {
  const url = new URL(pathname, UNIFIED_SERVER_URL);
  url.search = new URLSearchParams(search as Record<string, string>).toString();
  return url.toString();
}

proxyRouter.get('/extract', async (req, res) => {
  try {
    const res_ = await fetch(upstream('/extract', req.query));
    const html = await res_.text();
    res.status(res_.status).set('content-type', 'text/html').send(html);
  } catch (e) {
    res.status(502).send(`<p>Upstream error: ${(e as Error).message}</p>`);
  }
});

proxyRouter.get('/llm', async (req, res) => {
  try {
    const res_ = await fetch(upstream('/llm', req.query));
    const data = await res_.json();
    res.status(res_.status).json(data);
  } catch (e) {
    res.status(502).json({ error: `upstream error: ${(e as Error).message}` });
  }
});

proxyRouter.post('/generate-blurb', async (req, res) => {
  try {
    const res_ = await fetch(`${UNIFIED_SERVER_URL}/generate-blurb`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await res_.json();
    res.status(res_.status).json(data);
  } catch (e) {
    res.status(502).json({ error: `upstream error: ${(e as Error).message}` });
  }
});

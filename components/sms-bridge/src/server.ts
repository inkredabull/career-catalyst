import express from 'express';

import { PORT } from './config/env';
import { proxyRouter } from './routes/proxy';
import { sendRouter } from './routes/send';

export function createApp(): express.Express {
  const app = express();

  // express.json() replaces the body-parser dependency the standalone repo
  // carried; Express 5 ships it built in.
  app.use(express.json());

  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      console.log(
        `${new Date().toISOString()} ${req.method} ${req.url} ${res.statusCode} ${ms}ms`
      );
    });
    next();
  });

  app.get('/health', (_req, res) => {
    res.status(200).send('ok');
  });

  app.use(proxyRouter);
  app.use(sendRouter);

  return app;
}

if (require.main === module) {
  createApp().listen(PORT, () => {
    console.log(`🚀 SMS bridge listening on http://localhost:${PORT}`);
  });
}

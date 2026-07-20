import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './env.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFound } from './middleware/error.js';
import { registerRoutes } from './routes/index.js';

const app = express();

// Trust exactly one proxy hop (the reverse proxy / load balancer in front of
// the app). Trusting every hop ('true') lets clients spoof X-Forwarded-For and
// evade the per-IP rate limiter.
app.set('trust proxy', 1);
app.use(
  helmet({
    contentSecurityPolicy:
      env.NODE_ENV === 'production'
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:'],
              connectSrc: ["'self'", `https://${env.AUTH0_DOMAIN}`],
              frameSrc: ["'self'", `https://${env.AUTH0_DOMAIN}`],
            },
          }
        : false,
  })
);
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));
app.use(
  cors({
    origin: env.NODE_ENV === 'production' ? env.CORS_ORIGIN : true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  })
);
app.use(
  '/api',
  rateLimit({
    windowMs: 60_000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
  })
);
app.use(express.json({ limit: '1mb' }));

registerRoutes(app);

if (env.NODE_ENV === 'production') {
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  // Resolve the web bundle relative to THIS module, not process.cwd(): the
  // production CMD runs the server from packages/server, so a cwd-relative path
  // pointed at packages/server/packages/web/dist and served nothing. The built
  // server lives at packages/server/dist/index.js, so the web bundle is two
  // levels up under packages/web/dist.
  const webDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  app.use(express.static(webDist));
  // SPA fallback for client-side routes only. Unknown /api paths must fall
  // through to the JSON 404 handler rather than being served index.html.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next();
      return;
    }
    res.sendFile(resolve(webDist, 'index.html'));
  });
}

app.use(notFound);
app.use(errorHandler);

export default app;

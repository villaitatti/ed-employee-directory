import type { Express } from 'express';
import { adminRouter } from './admin.js';
import { v1Router } from './v1.js';

export function registerRoutes(app: Express) {
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'ed-employee-directory' });
  });

  app.use('/api/admin', adminRouter);
  app.use('/api/v1', v1Router);
}

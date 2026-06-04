import app from './app.js';
import { env } from './env.js';
import { logger } from './lib/logger.js';

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'ED server listening');
});

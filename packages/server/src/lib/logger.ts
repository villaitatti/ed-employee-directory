import pino, { type LoggerOptions } from 'pino';
import { env } from '../env.js';

const loggerOptions: LoggerOptions = {
  level: env.NODE_ENV === 'test' ? 'silent' : process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie'],
    remove: true,
  },
};

if (env.NODE_ENV === 'development') {
  loggerOptions.transport = {
    target: 'pino-pretty',
    options: { colorize: true, singleLine: true },
  };
}

export const logger = pino(loggerOptions);

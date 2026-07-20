import { Prisma } from '@prisma/client';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { logger } from '../lib/logger.js';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export const notFound: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, 'NOT_FOUND', `No route matches ${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request did not pass validation.',
        details: error.flatten(),
      },
    });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  if (error instanceof MulterError) {
    // File-upload failures (e.g. oversized file) are client errors, not 500s.
    const tooLarge = error.code === 'LIMIT_FILE_SIZE';
    res.status(tooLarge ? 413 : 400).json({
      error: {
        code: tooLarge ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR',
        message: tooLarge ? 'The uploaded file is too large (max 8 MB).' : 'The file upload could not be processed.',
      },
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Translate the common constraint violations into actionable 4xx responses
    // instead of leaking them as generic 500s. Field names are not echoed back.
    if (error.code === 'P2002') {
      res.status(409).json({
        error: { code: 'DUPLICATE_VALUE', message: 'A record with these values already exists.' },
      });
      return;
    }
    if (error.code === 'P2025') {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'The requested record was not found.' },
      });
      return;
    }
    if (error.code === 'P2003') {
      res.status(409).json({
        error: { code: 'FOREIGN_KEY_CONSTRAINT', message: 'A related record prevents this operation.' },
      });
      return;
    }
  }

  if (error?.name === 'UnauthorizedError') {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'A valid bearer token is required.' },
    });
    return;
  }

  logger.error({ error }, 'Unhandled request error');
  res.status(500).json({
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' },
  });
};

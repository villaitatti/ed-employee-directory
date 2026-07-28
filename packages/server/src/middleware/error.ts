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

/** Largest upload multer accepts, kept here so the error copy can name it. */
export const MAX_UPLOAD_MB = 8;

/**
 * Unique columns the UI can point at by name. A P2002 only tells us which
 * constraint fired; this maps that to the form field the operator has to change,
 * so "already exists" can say *what* already exists. Anything not listed stays
 * anonymous — the client then falls back to the generic duplicate message.
 *
 * Only genuinely-unique columns belong here. `Department.name` is not unique
 * (only its normalized form is), and listing it would have been dead weight that
 * later mis-attributed some other table's `name` collision to a department.
 */
const DUPLICATE_FIELD_BY_CONSTRAINT: Record<string, string> = {
  employeeNumber: 'employeeNumber',
  workEmail: 'workEmail',
  normalizedName: 'departmentName',
};

function duplicateField(target: unknown): string | undefined {
  const columns = Array.isArray(target) ? target : typeof target === 'string' ? [target] : [];
  for (const column of columns) {
    // Postgres reports the index name (e.g. "Employee_workEmail_key"), SQLite the
    // bare column — match on any segment so both shapes resolve.
    for (const [constraint, field] of Object.entries(DUPLICATE_FIELD_BY_CONSTRAINT)) {
      if (String(column).split(/[._]/).includes(constraint)) return field;
    }
  }
  return undefined;
}

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
        message: tooLarge
          ? `The uploaded file is too large (max ${MAX_UPLOAD_MB} MB).`
          : 'The file upload could not be processed.',
        ...(tooLarge ? { details: { maxMb: MAX_UPLOAD_MB } } : {}),
      },
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Translate the common constraint violations into actionable 4xx responses
    // instead of leaking them as generic 500s. Only the *name* of the clashing
    // field travels back (never the stored value), so the form can highlight it.
    if (error.code === 'P2002') {
      const field = duplicateField(error.meta?.['target']);
      res.status(409).json({
        error: {
          code: 'DUPLICATE_VALUE',
          message: 'A record with these values already exists.',
          ...(field ? { details: { field } } : {}),
        },
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

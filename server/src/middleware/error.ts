import { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { ApiError } from '../lib/http';
import { logger } from '../lib/logger';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
  });
}

function prismaError(err: Prisma.PrismaClientKnownRequestError): { status: number; code: string; message: string } {
  switch (err.code) {
    case 'P2002':
      return {
        status: 409,
        code: 'DUPLICATE_RESOURCE',
        message: 'A record with the same unique value already exists.',
      };
    case 'P2025':
      return { status: 404, code: 'NOT_FOUND', message: 'The requested record does not exist.' };
    default:
      return { status: 500, code: 'DATABASE_ERROR', message: 'Database operation failed.' };
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid input.', details: err.flatten() },
    });
    return;
  }
  // csrf-csrf hands http-errors with code EBADCSRFTOKEN (name may be
  // ForbiddenError or BadRequestError depending on version).
  if (err instanceof Error && 'code' in err && err.code === 'EBADCSRFTOKEN') {
    res.status(403).json({ error: { code: 'CSRF_TOKEN_INVALID', message: 'Invalid CSRF token.' } });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = prismaError(err);
    res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    return;
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    logger.warn('Prisma validation error', err.message);
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input.' } });
    return;
  }
  if (err instanceof MulterError) {
    const isOversize = err.code === 'LIMIT_FILE_SIZE';
    res.status(isOversize ? 413 : 400).json({
      error: {
        code: isOversize ? 'FILE_TOO_LARGE' : 'INVALID_FILE',
        message: isOversize ? 'The file exceeds the allowed size.' : 'The file upload is invalid.',
      },
    });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Malformed request body.' } });
    return;
  }
  logger.error('Unhandled error', err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } });
}
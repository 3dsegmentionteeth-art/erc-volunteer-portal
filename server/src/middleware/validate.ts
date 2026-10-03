import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodTypeAny, z } from 'zod';
import { ApiError } from '../lib/http';

// Parses and replaces the body with the validated, typed value. The schema is
// the single source of truth server-side; client-side validation is never
// trusted on its own.
export function validate<T extends ZodTypeAny>(schema: T): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(new ApiError(400, 'Invalid input.', 'VALIDATION_ERROR', result.error.flatten()));
      return;
    }
    req.body = result.data as z.infer<T>;
    next();
  };
}

export function validateQuery<T extends ZodTypeAny>(schema: T): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(new ApiError(400, 'Invalid input.', 'VALIDATION_ERROR', result.error.flatten()));
      return;
    }
    req.query = result.data as unknown as Request['query'];
    next();
  };
}

export function validateParams<T extends ZodTypeAny>(schema: T): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(new ApiError(400, 'Invalid input.', 'VALIDATION_ERROR', result.error.flatten()));
      return;
    }
    req.params = result.data as unknown as Request['params'];
    next();
  };
}
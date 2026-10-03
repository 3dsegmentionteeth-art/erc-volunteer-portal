import { NextFunction, Request, RequestHandler, Response } from 'express';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const badRequest = (message: string, details?: unknown): ApiError =>
  new ApiError(400, message, 'BAD_REQUEST', details);

export const unauthorized = (message = 'Authentication required'): ApiError =>
  new ApiError(401, message, 'UNAUTHENTICATED');

export const forbidden = (message = 'Forbidden'): ApiError =>
  new ApiError(403, message, 'FORBIDDEN');

export const notFound = (message = 'Resource not found'): ApiError =>
  new ApiError(404, message, 'NOT_FOUND');

export const conflict = (message: string, code = 'CONFLICT'): ApiError =>
  new ApiError(409, message, code);

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export const asyncHandler = (fn: AsyncRoute): RequestHandler => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config';
import { doubleCsrfProtection } from './lib/csrf';
import { sessionMiddleware } from './lib/session';
import { errorHandler, notFoundHandler } from './middleware/error';
import { apiRouter } from './routes';

export function buildApp(): express.Express {
  const app = express();

  app.set('trust proxy', config.trustProxyHops);

  app.use(
    helmet({
      // The API returns JSON only at this stage; content-security-policy etc.
      // remain default. File/Document endpoints will revisit headers in the
      // object-storage phase.
    }),
  );

  app.use(
    cors({
      // Dev: reflect any origin (SPA runs on :5173). Production: restrict to
      // PUBLIC_HOST (single, credentials-carrying origin).
      origin: config.isProd ? new URL(config.publicHost).origin : true,
      credentials: true,
    }),
  );

  // Security-sensitive ordering: cookie-parser -> session -> csrf.
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(sessionMiddleware);

  // Double-submit CSRF protection on ALL mutating /api requests (GET, HEAD,
  // OPTIONS are ignored by the middleware). Every future mutating endpoint is
  // protected by default; a token from /api/auth/csrf-token is required.
  app.use('/api', doubleCsrfProtection);

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
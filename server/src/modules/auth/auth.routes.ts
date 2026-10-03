import { Router } from 'express';
import { loginLimiter, loginSlowDown } from '../../lib/rateLimit';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { csrfToken, login, logout, me } from './auth.controller';
import { loginSchema } from './auth.schemas';

export const authRouter = Router();

// Public: issues the double-submit CSRF cookie + token for the SPA.
authRouter.get('/csrf-token', csrfToken);

// Rate-limited + slow-downed login (brute-force protection).
authRouter.post('/login', loginSlowDown, loginLimiter, validate(loginSchema), login);

// Mutating logout; CSRF-protected by the global /api middleware.
authRouter.post('/logout', logout);

// Authenticated identity endpoint.
authRouter.get('/me', requireAuth(), me);
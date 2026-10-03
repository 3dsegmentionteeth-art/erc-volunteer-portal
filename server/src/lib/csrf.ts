import { doubleCsrf } from 'csrf-csrf';
import { config } from '../config';

export const {
  doubleCsrfProtection,
  generateToken,
  invalidCsrfTokenError,
} = doubleCsrf({
  // Server-side secret; the client echoes the issued token in the header
  // while the token<hash> pair travels in an httpOnly, SameSite=Lax cookie
  // (double-submit pattern). Deliberately NOT bound to the session id so the
  // token survives session regeneration on login (fixation mitigation).
  getSecret: () => config.csrfSecret,
  getSessionIdentifier: () => '',
  cookieName: config.isProd ? '__Host-erc.csrf' : 'erc.csrf',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    path: '/',
    // Match the session lifetime so a still-logged-in browser never loses its
    // CSRF cookie (otherwise every mutation after a browser restart would 403).
    maxAge: config.sessionMaxAgeMs,
  },
  getTokenFromRequest: (req) => req.headers['x-csrf-token'],
  size: 64,
});
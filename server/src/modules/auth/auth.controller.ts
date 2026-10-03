import { Request, Response } from 'express';
import { config } from '../../config';
import { generateToken } from '../../lib/csrf';
import { ApiError, asyncHandler } from '../../lib/http';
import { getActor } from '../../middleware/auth';
import { auditLoginFailure, loginWithIdentifier } from './auth.service';
import { createAudit } from './auth.repository';
import type { LoginInput } from './auth.schemas';

export const csrfToken = (req: Request, res: Response): void => {
  // overwrite=true: a stale/invalid csrf cookie (e.g. after a CSRF_SECRET
  // rotation or a corrupted cookie) is replaced here instead of throwing, so
  // the SPA can self-heal without the user clearing cookies manually.
  const token = generateToken(req, res, true);
  res.json({ csrfToken: token });
};

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { identifier, password } = req.body as LoginInput;
  const result = await loginWithIdentifier(identifier, password, req.ip);

  if (!result.ok) {
    await auditLoginFailure(identifier, req.ip);
    throw new ApiError(401, 'Invalid credentials.', 'INVALID_CREDENTIALS');
  }

  // Session-fixation mitigation: issue a fresh session id before storing auth.
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
  req.session.auth = {
    ...result.actor,
    displayName: result.displayName,
    loginId: result.usernameOrCode,
  };
  await new Promise<void>((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });

  // Issue a fresh CSRF token after the session change; the client replaces it.
  const csrf = generateToken(req, res);

  res.json({ user: req.session.auth, csrfToken: csrf });
});

export const me = (req: Request, res: Response): void => {
  const actor = getActor(req);
  if (!actor) throw new ApiError(401, 'Authentication required.', 'UNAUTHENTICATED');
  res.json({ user: actor });
};

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const actor = getActor(req);
  if (actor) {
    await createAudit({
      actorType: actor.role,
      actorId: actor.userId,
      actorName: actor.displayName,
      actorRole: actor.role,
      action: 'auth.logout',
      branchId: actor.branchId,
      ipAddress: req.ip,
    });
  }
  await new Promise<void>((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
  res.clearCookie(config.sessionCookieName, { path: '/' });
  res.json({ ok: true });
});
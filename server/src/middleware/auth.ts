import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ApiError } from '../lib/http';

export type ActorRole = 'admin' | 'volunteer';

export interface SessionActor {
  role: ActorRole;
  userId: string;
  adminId?: string;
  volunteerId?: string;
  /** branch_id the actor belongs to; null for HQ admins. */
  branchId: string | null;
  /** true only for HQ admins (unscoped across branches). */
  isHq: boolean;
  displayName?: string;
  loginId?: string;
}

export function getActor(req: Request): SessionActor | undefined {
  // SessionData is augmented in src/types/session.d.ts; sessionMiddleware always
  // populates req.session before any auth middleware runs.
  return req.session?.auth;
}

/** Requires a logged-in session. Optionally restricts to a role. */
export function requireAuth(role?: ActorRole): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const actor = getActor(req);
    if (!actor) {
      next(new ApiError(401, 'Authentication required.', 'UNAUTHENTICATED'));
      return;
    }
    if (role && actor.role !== role) {
      next(new ApiError(403, 'You do not have permission for this action.', 'FORBIDDEN'));
      return;
    }
    next();
  };
}

/**
 * Volunteer-subject ownership check: a volunteer may only touch resources that
 * belong to them. Admin subjects pass through (their reach is governed by
 * requireBranchScope). Called on every resource-holding endpoint — an IDOR
 * attempt (e.g. a forged volunteer id in a URL) must resolve as 403.
 */
export function requireOwnership(getOwnerId: (req: Request) => string | null | undefined): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const actor = getActor(req);
    if (!actor) {
      next(new ApiError(401, 'Authentication required.', 'UNAUTHENTICATED'));
      return;
    }
    if (actor.role === 'volunteer') {
      const ownerId = getOwnerId(req);
      if (!ownerId || ownerId !== actor.volunteerId) {
        next(new ApiError(403, 'You do not have permission for this resource.', 'FORBIDDEN'));
        return;
      }
    }
    next();
  };
}

/**
 * Branch-scoping check: a branch admin may only reach resources whose
 * branch_id equals their own. HQ admins bypass the check (scoped by nothing).
 * Must be applied on every admin query, not just in the UI.
 */
export function requireBranchScope(getBranchId: (req: Request) => string | null | undefined): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const actor = getActor(req);
    if (!actor) {
      next(new ApiError(401, 'Authentication required.', 'UNAUTHENTICATED'));
      return;
    }
    if (actor.role === 'admin' && actor.isHq) {
      next();
      return;
    }
    if (actor.role === 'volunteer') {
      // Volunteers are isolated at the resource level via requireOwnership.
      next();
      return;
    }
    // Branch admin: target branch must be present and match the admin's own
    // branch. Fails closed when the endpoint forgets to supply the branch id.
    const targetBranchId = getBranchId(req);
    if (!targetBranchId || targetBranchId !== actor.branchId) {
      next(new ApiError(403, 'This resource belongs to another branch.', 'BRANCH_SCOPE_VIOLATION'));
      return;
    }
    next();
  };
}
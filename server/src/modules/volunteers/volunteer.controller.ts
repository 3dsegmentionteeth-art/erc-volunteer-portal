import { Request, Response } from 'express';
import { ApiError, asyncHandler } from '../../lib/http';
import { getActor, SessionActor } from '../../middleware/auth';
import type { ListRegistrationsQuery, RegisterInput, UpdateVolunteerProfileInput, VerifyEmailInput } from './volunteer.schemas';
import {
  approveRegistration,
  getRegistration,
  getVolunteerProfile,
  listAdminRegistrations,
  listBranches,
  registerVolunteer,
  rejectRegistration,
  resendVolunteerVerification,
  updateVolunteerProfile,
  verifyVolunteerEmail,
} from './volunteer.service';

function actorOf(req: Request): SessionActor {
  const actor = getActor(req);
  if (!actor) throw new ApiError(401, 'Authentication required.', 'UNAUTHENTICATED');
  return actor;
}

// Public self-registration (rate-limited, CSRF-protected by the global /api
// middleware like every mutating route).
export const register = asyncHandler(async (req: Request, res: Response) => {
  const registration = await registerVolunteer(req.body as RegisterInput, req.ip);
  res.status(201).json({ registration });
});

// Public branch catalog (used by the registration form's branch dropdown).
export const branches = asyncHandler(async (_req: Request, res: Response) => {
  const items = await listBranches();
  res.json({ items, total: items.length });
});

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const result = await verifyVolunteerEmail((req.body as VerifyEmailInput).token, req.ip);
  res.json(result);
});

export const resendVerification = asyncHandler(async (req: Request, res: Response) => {
  const user = actorOf(req);
  const result = await resendVolunteerVerification(user, req.ip);
  res.json(result);
});

export const profileGet = asyncHandler(async (req: Request, res: Response) => {
  const user = actorOf(req);
  res.json(await getVolunteerProfile(user));
});

export const profilePatch = asyncHandler(async (req: Request, res: Response) => {
  const user = actorOf(req);
  const result = await updateVolunteerProfile(user, req.body as UpdateVolunteerProfileInput, req.ip);
  res.json(result);
});

// Admin review queue (requireAuth('admin') is applied at the router).
export const list = asyncHandler(async (req: Request, res: Response) => {
  const user = actorOf(req);
  const { page, pageSize, q, status } = req.query as unknown as ListRegistrationsQuery;
  const result = await listAdminRegistrations(user, { page, pageSize, q, status });
  res.json(result);
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  const user = actorOf(req);
  const registration = await getRegistration(user, req.params.id as string);
  res.json({ registration });
});

export const approve = asyncHandler(async (req: Request, res: Response) => {
  const user = actorOf(req);
  const result = await approveRegistration(user, req.params.id as string, req.ip);
  res.json(result);
});

export const reject = asyncHandler(async (req: Request, res: Response) => {
  const user = actorOf(req);
  const registration = await rejectRegistration(user, req.params.id as string, req.ip);
  res.json({ registration });
});
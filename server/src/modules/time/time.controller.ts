import { Request, Response } from 'express';
import { ApiError, asyncHandler } from '../../lib/http';
import { getActor, SessionActor } from '../../middleware/auth';
import type { CreateAddTimeRequestInput, CreateEditTimeRequestInput } from './time.schemas';
import {
  createVolunteerAddTimeRequest,
  createVolunteerEditTimeRequest,
  getVolunteerTimeRecords,
  getVolunteerTimeSummary,
  listVolunteerEditTimeRequests,
  listVolunteerTimeAdmins,
  listVolunteerTimeRequests,
} from './time.service';

function actorOf(req: Request): SessionActor {
  const actor = getActor(req);
  if (!actor) throw new ApiError(401, 'Authentication required.', 'UNAUTHENTICATED');
  return actor;
}

// All endpoints are volunteer-authed and ownership-scoped inside the service
// (requireAuth('volunteer') is applied at the router).
export const summary = asyncHandler(async (req: Request, res: Response) => {
  res.json(await getVolunteerTimeSummary(actorOf(req)));
});

export const records = asyncHandler(async (req: Request, res: Response) => {
  res.json(await getVolunteerTimeRecords(actorOf(req)));
});

export const admins = asyncHandler(async (req: Request, res: Response) => {
  res.json(await listVolunteerTimeAdmins(actorOf(req)));
});

export const listRequests = asyncHandler(async (req: Request, res: Response) => {
  res.json(await listVolunteerTimeRequests(actorOf(req)));
});

export const addRequest = asyncHandler(async (req: Request, res: Response) => {
  const result = await createVolunteerAddTimeRequest(actorOf(req), req.body as CreateAddTimeRequestInput, req.ip);
  res.status(201).json(result);
});

export const listEditRequests = asyncHandler(async (req: Request, res: Response) => {
  res.json(await listVolunteerEditTimeRequests(actorOf(req)));
});

export const editRequest = asyncHandler(async (req: Request, res: Response) => {
  const result = await createVolunteerEditTimeRequest(actorOf(req), req.body as CreateEditTimeRequestInput, req.ip);
  res.status(201).json(result);
});
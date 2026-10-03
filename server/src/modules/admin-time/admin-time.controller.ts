import { Request, Response } from 'express';
import { ApiError, asyncHandler } from '../../lib/http';
import { getActor, SessionActor } from '../../middleware/auth';
import type { AdjustmentInput, AdminRequestsQuery, DecisionInput } from './admin-time.schemas';
import {
  createAdminAdjustment,
  decideAddTimeRequest,
  decideEditTimeRequest,
  getAdminTimeOverview,
  getAdminVolunteerRecords,
  listAdminTimeEditRequests,
  listAdminTimeRequests,
  listAdminTimeVolunteers,
  verifyVolunteerIdentity,
} from './admin-time.service';

function actorOf(req: Request): SessionActor {
  const actor = getActor(req);
  if (!actor) throw new ApiError(401, 'Authentication required.', 'UNAUTHENTICATED');
  return actor;
}

export const overviewGet = asyncHandler(async (req: Request, res: Response) => {
  res.json(await getAdminTimeOverview(actorOf(req)));
});

export const requestsGet = asyncHandler(async (req: Request, res: Response) => {
  res.json(await listAdminTimeRequests(actorOf(req), req.query as AdminRequestsQuery));
});

export const editRequestsGet = asyncHandler(async (req: Request, res: Response) => {
  res.json(await listAdminTimeEditRequests(actorOf(req), req.query as AdminRequestsQuery));
});

export const requestPost = asyncHandler(async (req: Request, res: Response) => {
  res.json(await decideAddTimeRequest(actorOf(req), req.params.id as string, req.body as DecisionInput, req.ip));
});

export const editRequestPost = asyncHandler(async (req: Request, res: Response) => {
  res.json(await decideEditTimeRequest(actorOf(req), req.params.id as string, req.body as DecisionInput, req.ip));
});

export const adjustmentPost = asyncHandler(async (req: Request, res: Response) => {
  res.json(await createAdminAdjustment(actorOf(req), req.body as AdjustmentInput, req.ip));
});

export const volunteersGet = asyncHandler(async (req: Request, res: Response) => {
  res.json(await listAdminTimeVolunteers(actorOf(req)));
});

export const volunteerRecordsGet = asyncHandler(async (req: Request, res: Response) => {
  res.json(await getAdminVolunteerRecords(actorOf(req), req.params.volunteerId as string));
});

export const identityVerifyPost = asyncHandler(async (req: Request, res: Response) => {
  res.json(await verifyVolunteerIdentity(actorOf(req), req.params.volunteerId as string, req.ip));
});
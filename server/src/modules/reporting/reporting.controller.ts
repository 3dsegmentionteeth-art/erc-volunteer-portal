import { Request, Response } from 'express';
import { ApiError, asyncHandler } from '../../lib/http';
import { getActor, SessionActor } from '../../middleware/auth';
import type { RefParams, ReportListQuery, RevokeReportBody, VolunteerIdParams } from './reporting.schemas';
import {
  generateServiceReport,
  listVolunteerReports,
  revokeReport,
  verifyServiceReportRef,
} from './reporting.service';

function actorOf(req: Request): SessionActor {
  const actor = getActor(req);
  if (!actor) throw new ApiError(401, 'Authentication required.', 'UNAUTHENTICATED');
  return actor;
}

export const reportGet = asyncHandler(async (req: Request, res: Response) => {
  const { volunteerId } = req.params as VolunteerIdParams;
  res.json(await generateServiceReport(actorOf(req), volunteerId, req.ip));
});

export const reportsListGet = asyncHandler(async (req: Request, res: Response) => {
  const { volunteerId } = req.params as VolunteerIdParams;
  const { page, pageSize } = req.query as unknown as ReportListQuery;
  res.json(await listVolunteerReports(actorOf(req), volunteerId, page, pageSize));
});

export const revokePost = asyncHandler(async (req: Request, res: Response) => {
  const { ref, reason } = req.body as RevokeReportBody;
  res.json(await revokeReport(actorOf(req), ref, reason?.trim() || null, req.ip));
});

export const verifyGet = asyncHandler(async (req: Request, res: Response) => {
  const { ref } = req.params as RefParams;
  res.json(await verifyServiceReportRef(ref));
});
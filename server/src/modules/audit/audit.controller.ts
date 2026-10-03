import { Request, Response } from 'express';
import { ApiError, asyncHandler } from '../../lib/http';
import { getActor, SessionActor } from '../../middleware/auth';
import type { ListActivityQuery, ListAuditQuery } from './audit.schemas';
import { listAdminAuditEntries, listVolunteerActivity } from './audit.service';

function actorOf(req: Request): SessionActor {
  const actor = getActor(req);
  if (!actor) throw new ApiError(401, 'Authentication required.', 'UNAUTHENTICATED');
  return actor;
}

export const auditListGet = asyncHandler(async (req: Request, res: Response) => {
  res.json(await listAdminAuditEntries(actorOf(req), req.query as unknown as ListAuditQuery));
});

export const activityGet = asyncHandler(async (req: Request, res: Response) => {
  res.json(await listVolunteerActivity(actorOf(req), req.query as unknown as ListActivityQuery));
});
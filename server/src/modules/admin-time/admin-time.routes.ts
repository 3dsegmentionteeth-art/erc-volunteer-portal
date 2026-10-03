import { Router } from 'express';
import { adminTimeLimiter } from '../../lib/rateLimit';
import { requireAuth } from '../../middleware/auth';
import { validate, validateParams, validateQuery } from '../../middleware/validate';
import {
  adjustmentPost,
  editRequestPost,
  editRequestsGet,
  identityVerifyPost,
  overviewGet,
  requestPost,
  requestsGet,
  volunteerRecordsGet,
  volunteersGet,
} from './admin-time.controller';
import {
  adminRequestsQuerySchema,
  adjustmentSchema,
  decisionSchema,
  idParamsSchema,
  volunteerIdParamsSchema,
} from './admin-time.schemas';

// Administrative time management. Every route is admin-authenticated and
// branch-scoped in the service layer (HQ unscoped, branch admins own branch).
export const adminTimeRouter = Router();

// Branch admins require an own-branch scope. requireAuth('admin') with a
// `role` of 'hq_admin' carries isHq=true; 'branch_admin' must be tied to a
// branch (enforced at admin creation and again in adminBranchScope).
adminTimeRouter.use(requireAuth('admin'));

adminTimeRouter.get('/overview', overviewGet);
adminTimeRouter.get('/add-requests', validateQuery(adminRequestsQuerySchema), requestsGet);
adminTimeRouter.get('/edit-requests', validateQuery(adminRequestsQuerySchema), editRequestsGet);
adminTimeRouter.get('/volunteers', volunteersGet);
adminTimeRouter.get('/volunteers/:volunteerId/records', validateParams(volunteerIdParamsSchema), volunteerRecordsGet);

// Mutating admin actions carry the same double-submit CSRF protection as
// every /api route, plus a dedicated limiter.
adminTimeRouter.use(adminTimeLimiter);
adminTimeRouter.post('/add-requests/:id/decide', validateParams(idParamsSchema), validate(decisionSchema), requestPost);
adminTimeRouter.post('/edit-requests/:id/decide', validateParams(idParamsSchema), validate(decisionSchema), editRequestPost);
adminTimeRouter.post('/adjustments', validate(adjustmentSchema), adjustmentPost);
adminTimeRouter.post('/volunteers/:volunteerId/identity-verify', validateParams(volunteerIdParamsSchema), identityVerifyPost);
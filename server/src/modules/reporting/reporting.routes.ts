import { Router } from 'express';
import { reportLimiter, verifyRefLimiter } from '../../lib/rateLimit';
import { requireAuth } from '../../middleware/auth';
import { validate, validateParams, validateQuery } from '../../middleware/validate';
import { reportGet, reportsListGet, revokePost, verifyGet } from './reporting.controller';
import {
  refParamsSchema,
  reportListQuerySchema,
  revokeReportBodySchema,
  volunteerIdParamsSchema,
} from './reporting.schemas';

// Phase 6 admin service reports. Report generation is a GET that IS a write
// under the hood (append-only audit row + a fresh verification reference), so
// it carries its own limiter; revocation is a POST and carries the same one.
// Branch scoping is enforced in the service.
export const reportingAdminRouter = Router();
reportingAdminRouter.use(requireAuth('admin'));
reportingAdminRouter.get(
  '/volunteers/:volunteerId/report',
  reportLimiter,
  validateParams(volunteerIdParamsSchema),
  reportGet,
);
reportingAdminRouter.get(
  '/volunteers/:volunteerId/reports',
  validateParams(volunteerIdParamsSchema),
  validateQuery(reportListQuerySchema),
  reportsListGet,
);
reportingAdminRouter.post('/revoke', reportLimiter, validate(revokeReportBodySchema), revokePost);

// Public, read-only, no auth, no CSRF (GET): verifies an opaque report
// reference, returning only verifier-appropriate fields. Rate-limited to blunt
// brute-force probing.
export const verifyRouter = Router();
verifyRouter.get('/:ref', verifyRefLimiter, validateParams(refParamsSchema), verifyGet);
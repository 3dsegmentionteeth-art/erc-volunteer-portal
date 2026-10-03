import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validateQuery } from '../../middleware/validate';
import { activityGet, auditListGet } from './audit.controller';
import { listActivityQuerySchema, listAuditQuerySchema } from './audit.schemas';

// Phase 6 audit reads. Both are pure SELECTs against the append-only
// audit_logs; scoping is derived server-side from the session (a branch admin
// can only ever see their own branch's rows, a volunteer only their own).
export const auditAdminRouter = Router();
auditAdminRouter.use(requireAuth('admin'));
auditAdminRouter.get('/', validateQuery(listAuditQuerySchema), auditListGet);

export const activityRouter = Router();
activityRouter.use(requireAuth('volunteer'));
activityRouter.get('/', validateQuery(listActivityQuerySchema), activityGet);
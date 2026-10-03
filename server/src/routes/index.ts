import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { auditAdminRouter, activityRouter } from '../modules/audit/audit.routes';
import { adminTimeRouter } from '../modules/admin-time/admin-time.routes';
import { volunteerTimeRouter } from '../modules/time/time.routes';
import { documentsAdminRouter, registrationDocumentsRouter } from '../modules/volunteers/document.routes';
import { branches } from '../modules/volunteers/volunteer.controller';
import { registrationAdminRouter, volunteerRouter } from '../modules/volunteers/volunteer.routes';
import { reportingAdminRouter, verifyRouter } from '../modules/reporting/reporting.routes';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'erc-portal-server', time: new Date().toISOString() });
});

// Public, read-only: no auth, no CSRF (GET), consumed by the register form.
apiRouter.get('/branches', branches);

apiRouter.use('/auth', authRouter);
apiRouter.use('/volunteer', volunteerRouter);
apiRouter.use('/volunteer/time', volunteerTimeRouter);
apiRouter.use('/registrations', registrationDocumentsRouter);
apiRouter.use('/admin', documentsAdminRouter);
apiRouter.use('/admin/registrations', registrationAdminRouter);
apiRouter.use('/admin/time', adminTimeRouter);

// Phase 6: audit log + reports (admin, branch-scoped) and the public
// verification-reference lookup (no auth, read-only).
apiRouter.use('/admin/audit', auditAdminRouter);
apiRouter.use('/admin/reports', reportingAdminRouter);
apiRouter.use('/volunteer/activity', activityRouter);
apiRouter.use('/verify', verifyRouter);
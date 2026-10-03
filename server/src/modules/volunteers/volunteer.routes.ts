import { Router } from 'express';
import { registerLimiter, verifyLimiter } from '../../lib/rateLimit';
import { requireAuth } from '../../middleware/auth';
import { validate, validateParams, validateQuery } from '../../middleware/validate';
import { approve, get, list, profileGet, profilePatch, register, reject, resendVerification, verifyEmail } from './volunteer.controller';
import {
  listRegistrationsQuerySchema,
  registerSchema,
  registrationIdParamsSchema,
  updateVolunteerProfileSchema,
  verifyEmailSchema,
} from './volunteer.schemas';

export const volunteerRouter = Router();

// Public volunteer-facing endpoints (CSRF-protected globally, as all /api
// mutating routes are).
volunteerRouter.post('/register', registerLimiter, validate(registerSchema), register);
volunteerRouter.post('/verify-email', verifyLimiter, validate(verifyEmailSchema), verifyEmail);
volunteerRouter.post('/resend-verification', requireAuth('volunteer'), resendVerification);

// Volunteer's own profile (own-scoped; reads + whitelisted PATCH). The PATCH
// is CSRF-protected like every mutating route and gated on the volunteer role.
volunteerRouter.get('/profile', requireAuth('volunteer'), profileGet);
volunteerRouter.patch('/profile', requireAuth('volunteer'), validate(updateVolunteerProfileSchema), profilePatch);

// Admin-only review queue. Role is gated here; branch scoping is enforced in
// the service against the queried/decided registration.
export const registrationAdminRouter = Router();
registrationAdminRouter.use(requireAuth('admin'));
registrationAdminRouter.get('/', validateQuery(listRegistrationsQuerySchema), list);
registrationAdminRouter.get('/:id', validateParams(registrationIdParamsSchema), get);
registrationAdminRouter.post('/:id/approve', validateParams(registrationIdParamsSchema), approve);
registrationAdminRouter.post('/:id/reject', validateParams(registrationIdParamsSchema), reject);
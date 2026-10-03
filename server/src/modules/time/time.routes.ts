import { Router } from 'express';
import { timeRequestLimiter } from '../../lib/rateLimit';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { addRequest, admins, editRequest, listEditRequests, listRequests, records, summary } from './time.controller';
import { createAddTimeRequestSchema, createEditTimeRequestSchema } from './time.schemas';

export const volunteerTimeRouter = Router();

// Volunteer-scoped time dashboard. GET reads are plain session auth; the two
// POST mutations carry the global double-submit CSRF rule + a per-IP limiter.
volunteerTimeRouter.use(requireAuth('volunteer'));

volunteerTimeRouter.get('/summary', summary);
volunteerTimeRouter.get('/records', records);
volunteerTimeRouter.get('/admins', admins);

volunteerTimeRouter.get('/requests', listRequests);
volunteerTimeRouter.post('/requests', timeRequestLimiter, validate(createAddTimeRequestSchema), addRequest);

volunteerTimeRouter.get('/edit-requests', listEditRequests);
volunteerTimeRouter.post('/edit-requests', timeRequestLimiter, validate(createEditTimeRequestSchema), editRequest);
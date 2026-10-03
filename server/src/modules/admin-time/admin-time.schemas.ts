import { z } from 'zod';
import { config } from '../../config';
import { dateSchema } from '../time/time.schemas';

// Administrative time-management schemas. Everything the volunteer-facing time
// module already validates is reused (dates, events, caps); admin-specific
// rules here are: decision directions, signed adjustment minutes, and the
// mandatory adjustment reason.

export const decisionSchema = z.object({
  action: z.enum(['approve', 'reject']),
});

export type DecisionInput = z.infer<typeof decisionSchema>;

export const idParamsSchema = z.object({
  id: z.string().trim().min(1).max(64),
});

export type IdParams = z.infer<typeof idParamsSchema>;

export const volunteerIdParamsSchema = z.object({
  volunteerId: z.string().trim().min(1).max(64),
});

export type VolunteerIdParams = z.infer<typeof volunteerIdParamsSchema>;

export const adjustmentSchema = z.object({
  volunteerId: z.string().trim().min(1).max(64),
  date: dateSchema,
  event: z.string().trim().min(1, 'Event is required.').max(120, 'Event must be 120 characters or fewer.'),
  // Signed: positive adds time, negative subtracts (the official record is
  // {volunteer, date, event, delta}-aware via AdminTimeAdjustment). Zero is
  // meaningless; |minutes| capped to one day like volunteer requests.
  minutes: z
    .number()
    .int('Minutes must be a whole number.')
    .refine((value) => value !== 0, 'Adjustment time cannot be zero.')
    .refine(
      (value) => Math.abs(value) <= config.time.maxMinutesPerRequest,
      `An adjustment cannot exceed ${config.time.maxMinutesPerRequest} minutes (one day).`,
    ),
  reason: z.string().trim().min(1, 'Reason is required.').max(500, 'Reason must be 500 characters or fewer.'),
});

export type AdjustmentInput = z.infer<typeof adjustmentSchema>;

export const adminRequestsQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
});

export type AdminRequestsQuery = z.infer<typeof adminRequestsQuerySchema>;
import { z } from 'zod';
import { config } from '../../config';

// `YYYY-MM-DD` only. The `refine` rejects impossible calendar dates (e.g.
// 2026-02-30) that a naive `new Date(...)` would silently roll over.
export const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date. Use YYYY-MM-DD.')
  .refine((value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const dt = new Date(Date.UTC(year, month - 1, day));
    return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
  }, 'Invalid date.');

export type DateString = z.infer<typeof dateSchema>;

/** Converts a validated `YYYY-MM-DD` into a UTC-midnight Date for `@db.Date`. */
export function parseDateString(value: DateString): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

const eventSchema = z
  .string()
  .trim()
  .min(1, 'Event is required.')
  .max(120, 'Event must be 120 characters or fewer.');

// Volunteer-facing requests are always positive additions; admin subtractions
// do not exist until Phase 5's direct-adjustment tooling.
const minutesSchema = z
  .number()
  .int('Minutes must be a whole number.')
  .min(1, 'Time must be greater than zero.')
  .max(
    config.time.maxMinutesPerRequest,
    `A request cannot exceed ${config.time.maxMinutesPerRequest} minutes (one day).`,
  );

// Optional assignment of a branch supervisor. Presented as an empty string by
// the plain HTML select; trimmed back to `undefined` (never persisted as '').
const optionalAdminId = z
  .string()
  .trim()
  .max(64)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

export const createAddTimeRequestSchema = z.object({
  date: dateSchema,
  event: eventSchema,
  minutes: minutesSchema,
  assignedAdminId: optionalAdminId,
});

export type CreateAddTimeRequestInput = z.infer<typeof createAddTimeRequestSchema>;

export const createEditTimeRequestSchema = z.object({
  recordId: z.string().trim().min(1).max(64),
  date: dateSchema,
  event: eventSchema,
  minutes: minutesSchema,
  reason: z.string().trim().min(1, 'Reason is required.').max(500, 'Reason must be 500 characters or fewer.'),
  assignedAdminId: optionalAdminId,
});

export type CreateEditTimeRequestInput = z.infer<typeof createEditTimeRequestSchema>;
import { z } from 'zod';

export const volunteerIdParamsSchema = z.object({
  volunteerId: z.string().trim().min(1).max(64),
});

export type VolunteerIdParams = z.infer<typeof volunteerIdParamsSchema>;

// Public verification reference. The ref is an opaque 48-char hex token in
// practice; validation stays shape-agnostic so a stricter format can be
// introduced later without breaking the endpoint.
export const refParamsSchema = z.object({
  ref: z.string().trim().min(1).max(256),
});

export type RefParams = z.infer<typeof refParamsSchema>;

// Phase 6.1 admin revocation. The reason is optional (audited verbatim when
// given) and the ref is the same shape-agnostic opaque token as the public
// endpoint.
export const revokeReportBodySchema = z.object({
  ref: z.string().trim().min(1).max(256),
  reason: z.string().trim().max(500).optional(),
});

export type RevokeReportBody = z.infer<typeof revokeReportBodySchema>;

// Phase 6.1 admin report list (per volunteer): paged, branch-scoped.
export const reportListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type ReportListQuery = z.infer<typeof reportListQuerySchema>;
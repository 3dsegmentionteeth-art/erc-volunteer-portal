import { z } from 'zod';

// Phase 6: administrative audit-log query. Branch scoping is derived from the
// session server-side (never a query param), so a branch admin cannot widen
// their view to another branch's rows.
export const listAuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  // Free-text on the actor's display name.
  q: z.string().trim().max(120).optional(),
  // Exact action key (e.g. time.add_request.approved). Clients use a curated
  // vocabulary; anything stored in the log is acceptable.
  action: z.string().trim().max(100).optional(),
  targetType: z.string().trim().max(50).optional(),
  // Inclusive YYYY-MM-DD range on created_at.
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').optional(),
});

export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;

// Phase 6: volunteer-facing activity log. Own-scope only; the viewer's
// identity is read from the session, never from a query param.
export const listActivityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type ListActivityQuery = z.infer<typeof listActivityQuerySchema>;
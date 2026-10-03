import { z } from 'zod';

// The route params use explicit names because documents are nested under both
// registrations (public) and independent ids (admin review).
export const registrationIdParamsSchema = z.object({
  registrationId: z.string().trim().min(1).max(64),
});

export const documentIdParamsSchema = z.object({
  documentId: z.string().trim().min(1).max(64),
});

// DELETE /registrations/:registrationId/documents/:documentId — validated as a
// single object because sequential validateParams calls replace req.params.
export const registrationDocumentParamsSchema = z.object({
  registrationId: z.string().trim().min(1).max(64),
  documentId: z.string().trim().min(1).max(64),
});

// Multipart text field co-uploaded with the binary part; validate AFTER multer
// has populated req.body (the global JSON parser ignores multipart bodies).
const CATEGORY = ['photo', 'id_document', 'certificate', 'other'] as const;

// OPTIONAL in the schema on purpose: the service answers with a distinct 403
// code (APPLICATION_ACCESS_TOKEN_MISSING / _INVALID / _EXPIRED) rather than a
// generic 400 so callers can distinguish the failure cause.
export const applicationAccessTokenBodySchema = z.object({
  applicationAccessToken: z.string().trim().max(256).optional(),
});

export const uploadBodySchema = z.object({
  category: z.enum(CATEGORY, { message: 'Unknown document category.' }),
}).merge(applicationAccessTokenBodySchema);

export type UploadBody = z.infer<typeof uploadBodySchema>;

export const deleteBodySchema = applicationAccessTokenBodySchema;

export type DeleteBody = z.infer<typeof deleteBodySchema>;

export const documentCategoryQuerySchema = z.object({
  category: z.enum(CATEGORY).optional(),
});

export type DocumentCategoryQuery = z.infer<typeof documentCategoryQuerySchema>;

export const reviewDocumentSchema = z.object({
  note: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export type ReviewDocumentInput = z.infer<typeof reviewDocumentSchema>;
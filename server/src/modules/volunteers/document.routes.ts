import { Router } from 'express';
import { documentUploadLimiter } from '../../lib/rateLimit';
import { registrationDocumentUpload } from '../../lib/uploads';
import { requireAuth } from '../../middleware/auth';
import { validate, validateParams, validateQuery } from '../../middleware/validate';
import { approve, downloadUrl, list, reject, remove, upload } from './document.controller';
import {
  deleteBodySchema,
  documentCategoryQuerySchema,
  documentIdParamsSchema,
  registrationDocumentParamsSchema,
  registrationIdParamsSchema,
  reviewDocumentSchema,
  uploadBodySchema,
} from './document.schemas';

// Public applicant endpoints: documents are attached to a still-pending
// registration after the JSON registration submit (multipart + CSRF header).
export const registrationDocumentsRouter = Router();
registrationDocumentsRouter.post(
  '/:registrationId/documents',
  documentUploadLimiter,
  registrationDocumentUpload.single('file'),
  validate(uploadBodySchema),
  upload,
);
registrationDocumentsRouter.delete(
  '/:registrationId/documents/:documentId',
  validateParams(registrationDocumentParamsSchema),
  validate(deleteBodySchema),
  remove,
);

// Admin document review + retrieval (role gated here; branch scoping lives in
// the service against the document's own branch_id).
export const documentsAdminRouter = Router();
documentsAdminRouter.use(requireAuth('admin'));
documentsAdminRouter.get(
  '/registrations/:registrationId/documents',
  validateParams(registrationIdParamsSchema),
  validateQuery(documentCategoryQuerySchema),
  list,
);
documentsAdminRouter.get(
  '/documents/:documentId/download-url',
  validateParams(documentIdParamsSchema),
  downloadUrl,
);
documentsAdminRouter.post(
  '/documents/:documentId/approve',
  validateParams(documentIdParamsSchema),
  approve,
);
documentsAdminRouter.post(
  '/documents/:documentId/reject',
  validateParams(documentIdParamsSchema),
  validate(reviewDocumentSchema),
  reject,
);
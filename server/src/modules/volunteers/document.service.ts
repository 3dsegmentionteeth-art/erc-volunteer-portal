import { randomUUID } from 'node:crypto';
import { config } from '../../config';
import { ApiError, conflict, notFound } from '../../lib/http';
import { logger } from '../../lib/logger';
import { presignedDownloadUrl, putObject, removeObject } from '../../lib/storage';
import { sanitizeOriginalName } from '../../lib/uploads';
import type { SessionActor } from '../../middleware/auth';
import { createAudit } from '../auth/auth.repository';
import { assertApplicationAccessToken } from './volunteer.service';
import {
  createDocument,
  deleteDocumentById,
  findDocumentPlain,
  findRegistrationUploadTarget,
  listDocuments,
  reviewDocument,
  type SafeDocument,
} from './document.repository';

function assertAdminBranchScope(actor: SessionActor, branchId: string): void {
  if (actor.role === 'admin' && !actor.isHq && actor.branchId !== branchId) {
    throw new ApiError(403, 'This resource belongs to another branch.', 'BRANCH_SCOPE_VIOLATION');
  }
}

function adminAuditBase(actor: SessionActor) {
  return {
    actorType: 'admin' as const,
    actorId: actor.adminId,
    actorName: actor.displayName,
    actorRole: actor.role,
  };
}

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

// Public path: the applicant attaches documents to their still-pending
// registration. Authenticity rests on the conveyance-of-possession proof of
// the application-access token issued at registration (short-lived, single-use
// at the registration-life level) — documented in SECURITY.md together with the
// CSRF/rate-limit net.
export async function uploadRegistrationDocument(
  registrationId: string,
  file: UploadedFile,
  category: string,
  applicationAccessToken: unknown,
  ip?: string,
): Promise<SafeDocument> {
  const registration = await findRegistrationUploadTarget(registrationId);
  if (!registration) throw notFound('Registration not found.');
  if (registration.status !== 'pending') {
    throw conflict('This registration is no longer accepting documents.', 'REGISTRATION_DECIDED');
  }
  // Registration existence/state is answered first; then the POSESSION proof.
  await assertApplicationAccessToken(registrationId, applicationAccessToken);

  const objectKey = `registrations/${registrationId}/${randomUUID()}`;
  const originalName = sanitizeOriginalName(file.originalname);

  const document = await createDocument({
    registrationId: registration.id,
    branchId: registration.branchId,
    objectKey,
    originalName,
    contentType: file.mimetype,
    sizeBytes: file.size,
    category,
    status: 'pending',
  });

  try {
    await putObject(objectKey, file.buffer, file.mimetype);
  } catch (err) {
    // Roll back the DB row if the object never landed; an uploaded-but-missing
    // document row is worse than a clean 500.
    await deleteDocumentById(document.id).catch(() => undefined);
    throw err;
  }

  await createAudit({
    actorType: 'system',
    action: 'document.uploaded',
    targetType: 'document',
    targetId: document.id,
    branchId: registration.branchId,
    ipAddress: ip,
    metadata: { category, originalName, sizeBytes: file.size },
  });
  return document;
}

export async function deleteRegistrationDocument(
  registrationId: string,
  documentId: string,
  applicationAccessToken: unknown,
  ip?: string,
): Promise<void> {
  const document = await findDocumentPlain(documentId);
  if (!document || document.registrationId !== registrationId) {
    throw notFound('Document not found.');
  }
  const registration = await findRegistrationUploadTarget(registrationId);
  if (!registration) throw notFound('Registration not found.');
  if (registration.status !== 'pending') {
    throw conflict('This registration is no longer accepting documents.', 'REGISTRATION_DECIDED');
  }
  await assertApplicationAccessToken(registrationId, applicationAccessToken);
  if (document.status !== 'pending') {
    throw conflict('A reviewed document cannot be deleted.', 'DOCUMENT_ALREADY_REVIEWED');
  }

  await deleteDocumentById(document.id);
  // Best-effort object cleanup after the row is gone; a stale object is
  // harmless (private, never linked from the API) and logged.
  try {
    await removeObject(document.objectKey);
  } catch (err) {
    logger.warn('Failed to remove orphaned object from storage', { key: document.objectKey, err });
  }

  await createAudit({
    actorType: 'system',
    action: 'document.deleted',
    targetType: 'document',
    targetId: document.id,
    branchId: document.branchId,
    ipAddress: ip,
    metadata: { category: document.category, originalName: document.originalName },
  });
}

// Admin review queue (branch-scoped; registration must exist).
export async function listRegistrationDocuments(
  actor: SessionActor,
  registrationId: string,
  category?: string,
) {
  const registration = await findRegistrationUploadTarget(registrationId);
  if (!registration) throw notFound('Registration not found.');
  assertAdminBranchScope(actor, registration.branchId);
  const items = await listDocuments(registrationId, category);
  return { items };
}

type FullDocument = NonNullable<Awaited<ReturnType<typeof findDocumentPlain>>>;

export async function getDocumentForReview(
  actor: SessionActor,
  documentId: string,
): Promise<FullDocument> {
  const document = await findDocumentPlain(documentId);
  if (!document) throw notFound('Document not found.');
  assertAdminBranchScope(actor, document.branchId);
  return document;
}

export async function approveDocument(actor: SessionActor, documentId: string, ip?: string) {
  const document = await getDocumentForReview(actor, documentId);
  if (document.status !== 'pending') {
    throw conflict('This document was already reviewed.', 'DOCUMENT_ALREADY_REVIEWED');
  }
  const reviewed = await reviewDocument(documentId, actor.adminId!, 'approved');
  await createAudit({
    ...adminAuditBase(actor),
    action: 'document.approved',
    targetType: 'document',
    targetId: documentId,
    branchId: document.branchId,
    ipAddress: ip,
    metadata: { category: document.category },
  });
  return reviewed;
}

export async function rejectDocument(actor: SessionActor, documentId: string, note: string | undefined, ip?: string) {
  const document = await getDocumentForReview(actor, documentId);
  if (document.status !== 'pending') {
    throw conflict('This document was already reviewed.', 'DOCUMENT_ALREADY_REVIEWED');
  }
  const reviewed = await reviewDocument(documentId, actor.adminId!, 'rejected', note);
  await createAudit({
    ...adminAuditBase(actor),
    action: 'document.rejected',
    targetType: 'document',
    targetId: documentId,
    branchId: document.branchId,
    ipAddress: ip,
    metadata: { category: document.category, ...(note ? { note } : {}) },
  });
  return reviewed;
}

// Time-limited, private, single-resource URL for the SPA/browser to fetch.
// Bucket access is never exposed to the client directly.
export async function documentDownloadUrl(actor: SessionActor, documentId: string) {
  const document = await getDocumentForReview(actor, documentId);
  const url = await presignedDownloadUrl(document.objectKey);
  return { url, expiresInSeconds: config.documents.presignedTtlSeconds };
}
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

// Everything a document consumer may see. The storage key is deliberately NOT
// exposed: downloads only ever go through the pre-signed URL service path.
const documentSelect = {
  id: true,
  registrationId: true,
  volunteerId: true,
  branchId: true,
  originalName: true,
  contentType: true,
  sizeBytes: true,
  category: true,
  status: true,
  reviewerId: true,
  reviewNote: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  reviewer: { select: { fullNameEn: true } },
} satisfies Prisma.DocumentSelect;

export type SafeDocument = Prisma.DocumentGetPayload<{ select: typeof documentSelect }>;

export function findDocumentPlain(id: string) {
  // Full row (includes object_key + owner ids): needed for scoping + storage.
  return prisma.document.findUnique({ where: { id } });
}

export function findRegistrationUploadTarget(id: string) {
  return prisma.registration.findUnique({
    where: { id },
    select: { id: true, branchId: true, status: true },
  });
}

export function listDocuments(
  registrationId: string,
  category?: string,
): Promise<SafeDocument[]> {
  return prisma.document.findMany({
    where: { registrationId, ...(category ? { category } : {}) },
    select: documentSelect,
    orderBy: { createdAt: 'desc' },
  });
}

export function createDocument(
  data: Prisma.DocumentUncheckedCreateInput,
): Promise<SafeDocument> {
  return prisma.document.create({ data, select: documentSelect });
}

export async function deleteDocumentById(id: string): Promise<void> {
  await prisma.document.delete({ where: { id } });
}

export async function reviewDocument(
  id: string,
  reviewerId: string,
  status: 'approved' | 'rejected',
  note?: string,
): Promise<SafeDocument> {
  return prisma.document.update({
    where: { id },
    data:
      status === 'approved'
        ? { status, reviewerId, reviewedAt: new Date() }
        : { status, reviewerId, reviewedAt: new Date(), ...(note ? { reviewNote: note } : {}) },
    select: documentSelect,
  });
}
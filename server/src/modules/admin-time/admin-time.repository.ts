import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { addRequestSelect, editRequestSelect } from '../time/time.repository';

export type Tx = Prisma.TransactionClient;

// All admin-time queries are scoped: `scopeBranchId` is the admin's own branch
// for branch admins, or null for HQ (unscoped). Every function accepts it
// explicitly so a caller can never forget the scope (fail closed = no filter
// collapse to "everything").

export function findAddRequestForAdmin(id: string) {
  return prisma.timeAddRequest.findUnique({
    where: { id },
    select: {
      id: true,
      branchId: true,
      volunteerId: true,
      date: true,
      event: true,
      minutes: true,
      status: true,
      assignedAdminId: true,
    },
  });
}

export function findEditRequestForAdmin(id: string) {
  return prisma.timeEditRequest.findUnique({
    where: { id },
    select: {
      id: true,
      branchId: true,
      volunteerId: true,
      recordId: true,
      requestedDate: true,
      requestedEvent: true,
      requestedMinutes: true,
      reason: true,
      status: true,
      originalDate: true,
      originalEvent: true,
      originalMinutes: true,
      assignedAdminId: true,
    },
  });
}

export function findVolunteerForAdmin(volunteerId: string) {
  return prisma.volunteer.findUnique({
    where: { id: volunteerId },
    select: {
      id: true,
      branchId: true,
      code: true,
      englishName: true,
      arabicName: true,
      email: true,
      phone: true,
      status: true,
      emailVerified: true,
      identityVerified: true,
      organization: true,
    },
  });
}

// Identity-verification target: branch (for scope), code (for the audit
// metadata) and the originating registration (id_document rows attach to the
// registration, not the volunteer — see countApprovedIdDocuments).
export function findVolunteerIdentityTarget(volunteerId: string) {
  return prisma.volunteer.findUnique({
    where: { id: volunteerId },
    select: { id: true, branchId: true, code: true, registrationId: true },
  });
}

// Identity verification is only meaningful after an admin has actually
// reviewed an ID document, so it must be backed by at least one APPROVED
// id_document. Production uploads attach to the pending registration (which
// links back to the volunteer via registration_id); the volunteer-owned owner
// path is honored too for any future review-attached rows.
export function countApprovedIdDocuments(volunteerId: string, registrationId: string | null) {
  return prisma.document.count({
    where: {
      category: 'id_document',
      status: 'approved',
      OR: [{ volunteerId }, ...(registrationId ? [{ registrationId }] : [])],
    },
  });
}

// Atomic claim: only a request still in `pending` can be decided. Two admins
// racing on the same request: exactly one updateMany wins (Postgres
// re-evaluates the predicate under the row lock); the loser sees count 0 and
// the service refuses the decision.
export function claimAddRequest(tx: Tx, id: string, status: 'approved' | 'rejected', decidedBy: string) {
  return tx.timeAddRequest.updateMany({
    where: { id, status: 'pending' },
    data: { status, decidedBy, decidedAt: new Date() },
  });
}

export function claimEditRequest(tx: Tx, id: string, status: 'approved' | 'rejected', decidedBy: string) {
  return tx.timeEditRequest.updateMany({
    where: { id, status: 'pending' },
    data: { status, decidedBy, decidedAt: new Date() },
  });
}

export function createRecordFromAddRequest(
  tx: Tx,
  data: { volunteerId: string; branchId: string; date: Date; event: string; minutes: number },
) {
  return tx.serviceTimeRecord.create({
    data: { ...data, source: 'add_request', reason: null },
    select: { id: true, date: true, event: true, minutes: true },
  });
}

export function linkAddRequestToRecord(tx: Tx, requestId: string, recordId: string) {
  return tx.timeAddRequest.update({ where: { id: requestId }, data: { recordId } });
}

export function applyEditRequestToRecord(
  tx: Tx,
  recordId: string,
  data: { date: Date; event: string; minutes: number },
) {
  return tx.serviceTimeRecord.update({
    where: { id: recordId },
    data,
    select: { id: true, date: true, event: true, minutes: true },
  });
}

export function createAdjustmentRecord(
  tx: Tx,
  data: { volunteerId: string; branchId: string; date: Date; event: string; minutes: number; reason: string },
) {
  return tx.serviceTimeRecord.create({
    data: { ...data, source: 'admin_adjustment' },
    select: { id: true },
  });
}

export function createAdjustmentLedger(
  tx: Tx,
  data: {
    adminId: string;
    volunteerId: string;
    branchId: string;
    date: Date;
    event: string;
    deltaMinutes: number;
    reason: string;
    recordId: string;
  },
) {
  return tx.adminTimeAdjustment.create({ data });
}

export function listAdminAddRequests(scopeBranchId: string | null, status?: string) {
  return prisma.timeAddRequest.findMany({
    where: { ...(scopeBranchId ? { branchId: scopeBranchId } : {}), ...(status ? { status } : {}) },
    select: {
      ...addRequestSelect,
      volunteer: { select: { id: true, code: true, englishName: true, arabicName: true } },
      branch: { select: { id: true, nameEn: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
}

export function listAdminEditRequests(scopeBranchId: string | null, status?: string) {
  return prisma.timeEditRequest.findMany({
    where: { ...(scopeBranchId ? { branchId: scopeBranchId } : {}), ...(status ? { status } : {}) },
    select: {
      ...editRequestSelect,
      volunteer: { select: { id: true, code: true, englishName: true, arabicName: true } },
      branch: { select: { id: true, nameEn: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
}

export function listAdminVolunteers(scopeBranchId: string | null) {
  return prisma.volunteer.findMany({
    where: { ...(scopeBranchId ? { branchId: scopeBranchId } : {}) },
    select: {
      id: true,
      code: true,
      englishName: true,
      arabicName: true,
      email: true,
      phone: true,
      organization: true,
      emailVerified: true,
      identityVerified: true,
      status: true,
    },
    orderBy: { englishName: 'asc' },
  });
}

export function listVolunteerRecords(scopeBranchId: string | null, volunteerId: string) {
  return prisma.serviceTimeRecord.findMany({
    where: { volunteerId, ...(scopeBranchId ? { branchId: scopeBranchId } : {}) },
    select: {
      id: true,
      date: true,
      event: true,
      minutes: true,
      source: true,
      reason: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function getAdminOverview(scopeBranchId: string | null) {
  const branchWhere = scopeBranchId ? { branchId: scopeBranchId } : {};
  const [pendingAdd, pendingEdit, pendingMinutes, approved, thisMonth, volunteerCount, recordDays] =
    await prisma.$transaction([
      prisma.timeAddRequest.count({ where: { ...branchWhere, status: 'pending' } }),
      prisma.timeEditRequest.count({ where: { ...branchWhere, status: 'pending' } }),
      prisma.timeAddRequest.aggregate({ where: { ...branchWhere, status: 'pending' }, _sum: { minutes: true } }),
      prisma.serviceTimeRecord.aggregate({ where: branchWhere, _sum: { minutes: true } }),
      prisma.serviceTimeRecord.aggregate({
        where: { ...branchWhere, date: { gte: new Date(new Date().toISOString().slice(0, 7) + '-01T00:00:00.000Z') } },
        _sum: { minutes: true },
      }),
      prisma.volunteer.count({ where: { ...branchWhere, status: 'approved' } }),
      prisma.serviceTimeRecord.groupBy({
        by: ['date'],
        where: branchWhere,
        _count: true,
        orderBy: { date: 'desc' },
      }),
    ]);
  return {
    pendingAddRequests: pendingAdd,
    pendingEditRequests: pendingEdit,
    pendingVolunteerMinutes: pendingMinutes._sum.minutes ?? 0,
    approvedMinutes: approved._sum.minutes ?? 0,
    approvedThisMonthMinutes: thisMonth._sum.minutes ?? 0,
    volunteerCount,
    serviceDays: recordDays.length,
  };
}
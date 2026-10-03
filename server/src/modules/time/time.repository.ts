import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

// Everything a volunteer's own dashboard may see. ServiceTimeRecord rows are
// OFFICIAL by construction (created only when an add request is approved, by
// admin adjustment, or by the seed), so no status filter is needed: approved
// only is the table's meaning.
export const recordSelect = {
  id: true,
  date: true,
  event: true,
  minutes: true,
  source: true,
  reason: true,
  createdAt: true,
} satisfies Prisma.ServiceTimeRecordSelect;

export const addRequestSelect = {
  id: true,
  date: true,
  event: true,
  minutes: true,
  status: true,
  assignedAdminId: true,
  decidedBy: true,
  decidedAt: true,
  createdAt: true,
  assignedAdmin: { select: { id: true, fullNameEn: true } },
} satisfies Prisma.TimeAddRequestSelect;

export const editRequestSelect = {
  id: true,
  requestedDate: true,
  requestedEvent: true,
  requestedMinutes: true,
  reason: true,
  status: true,
  assignedAdminId: true,
  decidedBy: true,
  decidedAt: true,
  createdAt: true,
  // Original values are snapshotted at submission time (the record itself may
  // be adjusted later by an admin, which must not rewrite the request history).
  originalDate: true,
  originalEvent: true,
  originalMinutes: true,
  assignedAdmin: { select: { id: true, fullNameEn: true } },
  record: { select: { id: true } },
} satisfies Prisma.TimeEditRequestSelect;

export function findVolunteerGate(volunteerId: string) {
  return prisma.volunteer.findUnique({
    where: { id: volunteerId },
    select: { status: true, emailVerified: true, branchId: true },
  });
}

// Looked up WITH the volunteerId filter so an IDOR attempt on an approved
// record resolves as 404 (no cross-volunteer information is revealed).
export function findServiceRecordForVolunteer(recordId: string, volunteerId: string) {
  return prisma.serviceTimeRecord.findUnique({
    where: { id: recordId, volunteerId },
    select: { id: true, date: true, event: true, minutes: true },
  });
}

export function listServiceRecords(volunteerId: string) {
  return prisma.serviceTimeRecord.findMany({
    where: { volunteerId },
    select: recordSelect,
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });
}

// Official total (sum of approved rows) and service days (distinct calendar
// dates carrying POSITIVE time; a pure-subtraction day is not a service day).
// Both are computed server-side — the client never trusts or sums its own numbers.
export async function getApprovedTotals(volunteerId: string) {
  const agg = await prisma.serviceTimeRecord.aggregate({
    where: { volunteerId },
    _sum: { minutes: true },
  });
  const days = await prisma.serviceTimeRecord.groupBy({
    by: ['date'],
    where: { volunteerId, minutes: { gt: 0 } },
  });
  return { totalMinutes: agg._sum.minutes ?? 0, serviceDays: days.length };
}

// Pending add time is NOT official; surfaced separately ("waiting for approval").
export async function getPendingAddTotals(volunteerId: string) {
  const agg = await prisma.timeAddRequest.aggregate({
    where: { volunteerId, status: 'pending' },
    _sum: { minutes: true },
    _count: true,
  });
  return { pendingMinutes: agg._sum.minutes ?? 0, pendingRequests: agg._count };
}

export function listAddTimeRequests(volunteerId: string) {
  return prisma.timeAddRequest.findMany({
    where: { volunteerId },
    select: addRequestSelect,
    orderBy: { createdAt: 'desc' },
  });
}

export function listEditTimeRequests(volunteerId: string) {
  return prisma.timeEditRequest.findMany({
    where: { volunteerId },
    select: editRequestSelect,
    orderBy: { createdAt: 'desc' },
  });
}

export function createAddTimeRequest(data: Prisma.TimeAddRequestUncheckedCreateInput) {
  return prisma.timeAddRequest.create({ data, select: { id: true, status: true, assignedAdminId: true } });
}

export function createEditTimeRequest(data: Prisma.TimeEditRequestUncheckedCreateInput) {
  return prisma.timeEditRequest.create({ data, select: { id: true, status: true, assignedAdminId: true } });
}

// The optional "assigned admin" must be an ACTIVE admin of the SAME branch as
// the volunteer; anything else is refused rather than routed cross-branch.
export function findActiveAdminInBranch(adminId: string, branchId: string) {
  return prisma.admin.findFirst({
    where: { id: adminId, branchId, isActive: true },
    select: { id: true },
  });
}

export function listActiveBranchAdmins(branchId: string) {
  return prisma.admin.findMany({
    where: { branchId, isActive: true },
    orderBy: { fullNameEn: 'asc' },
    select: { id: true, fullNameEn: true, username: true },
  });
}
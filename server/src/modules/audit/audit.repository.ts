import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

// Phase 6: audit-log reads. `audit_logs` is append-only (DB trigger guard), so
// these are pure SELECTs against immutable rows. Filters are always derived
// from the caller's scope; a branch admin's view is hard-pinned to their own
// branch id in the WHERE clause (fail closed).

export interface AuditFilters {
  // null = unscoped (HQ admin); set = branch-scoped (branch admin).
  branchId: string | null;
  q?: string;
  action?: string;
  targetType?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

const adminAuditSelect = {
  id: true,
  actorType: true,
  actorId: true,
  actorName: true,
  actorRole: true,
  action: true,
  targetType: true,
  targetId: true,
  branchId: true,
  metadata: true,
  ipAddress: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect;

function createdRange(from?: string, to?: string): { gte?: Date; lt?: Date } {
  const range: { gte?: Date; lt?: Date } = {};
  if (from) range.gte = new Date(`${from}T00:00:00.000Z`);
  // 'to' is inclusive: query up to (not including) the next day.
  if (to) {
    const nextDay = new Date(`${to}T00:00:00.000Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    range.lt = nextDay;
  }
  return range;
}

export async function listAuditEntries(filters: AuditFilters) {
  const where: Prisma.AuditLogWhereInput = {};
  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.q) where.actorName = { contains: filters.q, mode: 'insensitive' };
  if (filters.action) where.action = filters.action;
  if (filters.targetType) where.targetType = filters.targetType;
  const range = createdRange(filters.from, filters.to);
  if (range.gte || range.lt) where.createdAt = range;

  const [items, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      select: adminAuditSelect,
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total };
}

/**
 * Volunteer "what happened with my account" stream. Only rows tied to this
 * volunteer may appear:
 *  - rows the volunteer is the actor of (logins, their submissions, profile
 *    edits), matched on actor_id;
 *  - rows an admin wrote about the volunteer, matched two ways because the
 *    audit vocabulary is inconsistent: decisions carry metadata.volunteerId,
 *    while identity verification and report generation target the volunteer
 *    entity directly. Branch is pinned so cross-branch rows can never leak in.
 */
export async function listOwnActivity(volunteerId: string, branchId: string, page: number, pageSize: number) {
  const where: Prisma.AuditLogWhereInput = {
    branchId,
    OR: [
      { actorId: volunteerId },
      { metadata: { path: ['volunteerId'], equals: volunteerId } },
      { targetType: 'volunteer', targetId: volunteerId },
    ],
  };

  const [items, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        actorType: true,
        actorName: true,
        action: true,
        metadata: true,
        createdAt: true,
      },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total };
}
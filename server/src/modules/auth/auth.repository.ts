import { Admin, Prisma, Volunteer } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export type ActorAuditType = 'admin' | 'volunteer' | 'system';

export interface AuditEntry {
  actorType: ActorAuditType;
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  branchId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
}

export function findAdminByIdentifier(identifier: string): Promise<Admin | null> {
  return prisma.admin.findUnique({ where: { username: identifier } });
}

export function findVolunteerByCode(code: string): Promise<Volunteer | null> {
  return prisma.volunteer.findUnique({ where: { code } });
}

export function updateAdminLastLogin(adminId: string): Promise<Admin> {
  return prisma.admin.update({ where: { id: adminId }, data: { lastLoginAt: new Date() } });
}

// Writes an audit entry. Pass a transaction client when the entry must commit
// atomically with the business change it records (e.g. an approval); on
// rollback the audit row disappears with the rest of the transaction, which
// keeps the append-only log consistent with what actually happened.
export function createAudit(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<unknown> {
  const client = tx ?? prisma;
  return client.auditLog.create({ data: { ...entry, metadata: entry.metadata ?? undefined } });
}
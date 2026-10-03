import { ApiError, notFound } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import type { SessionActor } from '../../middleware/auth';
import type { ListActivityQuery, ListAuditQuery } from './audit.schemas';
import { listAuditEntries, listOwnActivity } from './audit.repository';

// Branch scope for admin reads: HQ unscoped, branch admins pinned to one
// branch. Mirrors admin-time.service so every admin module enforces the same
// fail-closed posture.
function adminBranchScope(actor: SessionActor): string | null {
  return actor.isHq ? null : actor.branchId;
}

export async function listAdminAuditEntries(actor: SessionActor, query: ListAuditQuery) {
  const { items, total } = await listAuditEntries({
    branchId: adminBranchScope(actor),
    q: query.q,
    action: query.action,
    targetType: query.targetType,
    from: query.from,
    to: query.to,
    page: query.page,
    pageSize: query.pageSize,
  });
  return {
    items,
    meta: { page: query.page, pageSize: query.pageSize, total },
  };
}

interface ActivityEntryView {
  id: string;
  action: string;
  actorType: string;
  actorLabel: string | null;
  createdAt: string;
  date?: string;
  event?: string;
  minutes?: number;
  reason?: string;
  recordId?: string;
  code?: string;
}

// The volunteer viewer gets a curated projection of the stored metadata, not
// the raw JSON blob. Every matched row is about the viewer themselves, but a
// projection keeps unknown/future metadata fields from silently leaking.
function toActivityView(entry: {
  id: string;
  actorType: string;
  actorName: string | null;
  action: string;
  metadata: unknown;
  createdAt: Date;
}): ActivityEntryView {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  const numberOrUndefined = (key: string): number | undefined =>
    typeof meta[key] === 'number' ? (meta[key] as number) : undefined;
  const stringOrUndefined = (key: string): string | undefined =>
    typeof meta[key] === 'string' ? (meta[key] as string) : undefined;

  const date = stringOrUndefined('date') ?? stringOrUndefined('requestedDate');
  const event = stringOrUndefined('event') ?? stringOrUndefined('requestedEvent');
  const minutes =
    numberOrUndefined('minutes') ?? numberOrUndefined('requestedMinutes') ?? numberOrUndefined('deltaMinutes');

  return {
    id: entry.id,
    action: entry.action,
    actorType: entry.actorType,
    actorLabel: entry.actorName,
    createdAt: entry.createdAt.toISOString(),
    date,
    event,
    minutes,
    reason: stringOrUndefined('reason'),
    recordId: stringOrUndefined('recordId'),
    code: stringOrUndefined('code'),
  };
}

export async function listVolunteerActivity(actor: SessionActor, query: ListActivityQuery) {
  if (!actor.volunteerId) throw new ApiError(403, 'Volunteer required.', 'FORBIDDEN');
  const volunteer = await prisma.volunteer.findUnique({
    where: { id: actor.volunteerId },
    select: { id: true, branchId: true },
  });
  if (!volunteer) throw notFound('Volunteer not found.');

  const { items, total } = await listOwnActivity(
    volunteer.id,
    volunteer.branchId,
    query.page,
    query.pageSize,
  );
  return {
    items: items.map(toActivityView),
    meta: { page: query.page, pageSize: query.pageSize, total },
  };
}
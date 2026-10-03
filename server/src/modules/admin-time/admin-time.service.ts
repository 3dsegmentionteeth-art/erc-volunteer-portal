import { prisma } from '../../lib/prisma';
import { ApiError, conflict, notFound } from '../../lib/http';
import { createAudit } from '../auth/auth.repository';
import { parseDateString } from '../time/time.schemas';
import { computeProfileCompletion } from '../volunteers/profile';
import type { SessionActor } from '../../middleware/auth';
import type { AdminRequestsQuery, AdjustmentInput, DecisionInput } from './admin-time.schemas';
import {
  applyEditRequestToRecord,
  claimAddRequest,
  claimEditRequest,
  createAdjustmentLedger,
  createAdjustmentRecord,
  createRecordFromAddRequest,
  countApprovedIdDocuments,
  findAddRequestForAdmin,
  findEditRequestForAdmin,
  findVolunteerForAdmin,
  findVolunteerIdentityTarget,
  getAdminOverview,
  linkAddRequestToRecord,
  listAdminAddRequests,
  listAdminEditRequests,
  listAdminVolunteers,
  listVolunteerRecords,
  type Tx,
} from './admin-time.repository';

function adminBranchScope(actor: SessionActor): string | null {
  // Branch admins act within their own branch; HQ admins are unscoped.
  return actor.isHq ? null : actor.branchId;
}

// Fail closed: a branch admin must never reach a resource of another branch.
function assertBranchScope(actor: SessionActor, resourceBranchId: string): void {
  if (!actor.isHq && actor.branchId !== resourceBranchId) {
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

export async function getAdminTimeOverview(actor: SessionActor) {
  const overview = await getAdminOverview(adminBranchScope(actor));
  return { overview };
}

export async function listAdminTimeRequests(actor: SessionActor, query: AdminRequestsQuery) {
  const requests = await listAdminAddRequests(adminBranchScope(actor), query.status);
  return { requests };
}

export async function listAdminTimeEditRequests(actor: SessionActor, query: AdminRequestsQuery) {
  const requests = await listAdminEditRequests(adminBranchScope(actor), query.status);
  return { requests };
}

export async function decideAddTimeRequest(actor: SessionActor, id: string, input: DecisionInput, ip?: string) {
  const request = await findAddRequestForAdmin(id);
  if (!request) throw notFound('Time request not found.');
  assertBranchScope(actor, request.branchId);

  const claimedStatus = input.action === 'approve' ? 'approved' : 'rejected';
  const result = await prisma.$transaction(async (tx) => {
    const claimed = await claimAddRequest(tx, id, claimedStatus, actor.adminId!);
    if (claimed.count !== 1) {
      throw conflict('This request has already been decided.', 'TIME_REQUEST_ALREADY_DECIDED');
    }
    if (input.action === 'reject') {
      await createAudit(
        {
          ...adminAuditBase(actor),
          action: 'time.add_request.rejected',
          targetType: 'timeAddRequest',
          targetId: id,
          branchId: request.branchId,
          ipAddress: ip,
          metadata: { volunteerId: request.volunteerId, minutes: request.minutes },
        },
        tx,
      );
      return { status: 'rejected' as const, recordId: null };
    }
    const record = await createRecordFromAddRequest(tx, {
      volunteerId: request.volunteerId,
      branchId: request.branchId,
      date: request.date,
      event: request.event,
      minutes: request.minutes,
    });
    await linkAddRequestToRecord(tx, id, record.id);
    await createAudit(
      {
        ...adminAuditBase(actor),
        action: 'time.add_request.approved',
        targetType: 'timeAddRequest',
        targetId: id,
        branchId: request.branchId,
        ipAddress: ip,
        metadata: {
          volunteerId: request.volunteerId,
          recordId: record.id,
          date: request.date.toISOString().slice(0, 10),
          event: request.event,
          minutes: request.minutes,
          assignedAdminId: request.assignedAdminId,
        },
      },
      tx,
    );
    return { status: 'approved' as const, recordId: record.id };
  });

  return { request: { id, ...result } };
}

export async function decideEditTimeRequest(actor: SessionActor, id: string, input: DecisionInput, ip?: string) {
  const request = await findEditRequestForAdmin(id);
  if (!request) throw notFound('Edit request not found.');
  assertBranchScope(actor, request.branchId);

  const claimedStatus = input.action === 'approve' ? 'approved' : 'rejected';
  const result = await prisma.$transaction(async (tx) => {
    const claimed = await claimEditRequest(tx, id, claimedStatus, actor.adminId!);
    if (claimed.count !== 1) {
      throw conflict('This edit request has already been decided.', 'TIME_EDIT_REQUEST_ALREADY_DECIDED');
    }
    const old = {
      date: request.originalDate.toISOString().slice(0, 10),
      event: request.originalEvent,
      minutes: request.originalMinutes,
    };
    const requested = {
      date: request.requestedDate.toISOString().slice(0, 10),
      event: request.requestedEvent,
      minutes: request.requestedMinutes,
    };
    if (input.action === 'reject') {
      await createAudit(
        {
          ...adminAuditBase(actor),
          action: 'time.edit_request.rejected',
          targetType: 'timeEditRequest',
          targetId: id,
          branchId: request.branchId,
          ipAddress: ip,
          metadata: { volunteerId: request.volunteerId, recordId: request.recordId, reason: request.reason, old, requested },
        },
        tx,
      );
      return { status: 'rejected' as const, record: null };
    }
    // Approve applies the requested values to the LIVE record in place. The
    // request row keeps its original snapshot so history is never rewritten.
    const record = await applyEditRequestToRecord(tx, request.recordId, {
      date: request.requestedDate,
      event: request.requestedEvent,
      minutes: request.requestedMinutes,
    });
    await createAudit(
      {
        ...adminAuditBase(actor),
        action: 'time.edit_request.approved',
        targetType: 'timeEditRequest',
        targetId: id,
        branchId: request.branchId,
        ipAddress: ip,
        metadata: { volunteerId: request.volunteerId, recordId: request.recordId, reason: request.reason, old, new: requested },
      },
      tx,
    );
    return { status: 'approved' as const, record };
  });

  return { request: { id, ...result } };
}

export async function createAdminAdjustment(actor: SessionActor, input: AdjustmentInput, ip?: string) {
  const volunteer = await findVolunteerForAdmin(input.volunteerId);
  if (!volunteer) throw notFound('Volunteer not found.');
  assertBranchScope(actor, volunteer.branchId);

  const record = await prisma.$transaction(async (tx) => {
    const created = await createAdjustmentRecord(tx, {
      volunteerId: volunteer.id,
      branchId: volunteer.branchId,
      date: parseDateString(input.date),
      event: input.event,
      minutes: input.minutes,
      reason: input.reason,
    });
    await createAdjustmentLedger(tx, {
      adminId: actor.adminId!,
      volunteerId: volunteer.id,
      branchId: volunteer.branchId,
      date: parseDateString(input.date),
      event: input.event,
      deltaMinutes: input.minutes,
      reason: input.reason,
      recordId: created.id,
    });
    await createAudit(
      {
        ...adminAuditBase(actor),
        action: 'time.adjustment.created',
        targetType: 'serviceTimeRecord',
        targetId: created.id,
        branchId: volunteer.branchId,
        ipAddress: ip,
        metadata: {
          volunteerId: volunteer.id,
          date: input.date,
          event: input.event,
          deltaMinutes: input.minutes,
          reason: input.reason,
        },
      },
      tx,
    );
    return created;
  });

  return { record: { id: record.id, volunteerId: volunteer.id } };
}

// Administrator identity verdict. The verdict is only meaningful — and this
// endpoint only succeeds — once the volunteer actually has an APPROVED
// id_document (checked here; pending/rejected documents or no document at all
// → 409 ID_DOCUMENT_NOT_APPROVED). Idempotent: verifying an already-verified
// volunteer with an approved document is a no-op success (the audit row is
// still written so the action is on record).
export async function verifyVolunteerIdentity(actor: SessionActor, volunteerId: string, ip?: string) {
  const volunteer = await findVolunteerIdentityTarget(volunteerId);
  if (!volunteer) throw notFound('Volunteer not found.');
  assertBranchScope(actor, volunteer.branchId);

  const approvedDocs = await countApprovedIdDocuments(volunteer.id, volunteer.registrationId);
  if (approvedDocs === 0) {
    throw conflict(
      'Identity cannot be verified until an approved ID document exists.',
      'ID_DOCUMENT_NOT_APPROVED',
    );
  }

  await prisma.$transaction(async (tx: Tx) => {
    await tx.volunteer.update({ where: { id: volunteerId }, data: { identityVerified: true } });
    await createAudit(
      {
        ...adminAuditBase(actor),
        action: 'volunteer.identity_verified',
        targetType: 'volunteer',
        targetId: volunteerId,
        branchId: volunteer.branchId,
        ipAddress: ip,
        metadata: { code: volunteer.code },
      },
      tx,
    );
  });
  return { identityVerified: true };
}

export async function listAdminTimeVolunteers(actor: SessionActor) {
  const scope = adminBranchScope(actor);
  const rows = await listAdminVolunteers(scope);
  const volunteers = await Promise.all(
    rows.map(async (volunteer) => {
      const completion = await computeProfileCompletion(volunteer.id);
      return {
        ...volunteer,
        profileCompletion: completion?.percent ?? 0,
        onboardingComplete: completion?.percent === 100,
      };
    }),
  );
  return { volunteers };
}

export async function getAdminVolunteerRecords(actor: SessionActor, volunteerId: string) {
  const volunteer = await findVolunteerForAdmin(volunteerId);
  if (!volunteer) throw notFound('Volunteer not found.');
  assertBranchScope(actor, volunteer.branchId);

  const records = await listVolunteerRecords(adminBranchScope(actor), volunteerId);
  const completion = await computeProfileCompletion(volunteerId);
  return {
    volunteer: { ...volunteer, profileCompletion: completion?.percent ?? 0, onboardingComplete: completion?.percent === 100 },
    records,
  };
}

export type { Tx };
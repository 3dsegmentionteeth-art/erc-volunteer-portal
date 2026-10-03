import { Prisma } from '@prisma/client';
import { config } from '../../config';
import { ApiError, conflict, notFound } from '../../lib/http';
import { createAudit } from '../auth/auth.repository';
import { computeProfileCompletion } from '../volunteers/profile';
import type { SessionActor } from '../../middleware/auth';
import { parseDateString, type CreateAddTimeRequestInput, type CreateEditTimeRequestInput } from './time.schemas';
import {
  createAddTimeRequest,
  createEditTimeRequest,
  findActiveAdminInBranch,
  findServiceRecordForVolunteer,
  findVolunteerGate,
  getApprovedTotals,
  getPendingAddTotals,
  listAddTimeRequests,
  listActiveBranchAdmins,
  listEditTimeRequests,
  listServiceRecords,
} from './time.repository';

const isDuplicateKey = (err: unknown): boolean => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

function ensureVolunteerId(actor: SessionActor): string {
  // requireAuth('volunteer') already guarantees this in practice; fail closed
  // for any future path that reaches the service without a volunteer subject.
  if (!actor.volunteerId) {
    throw new ApiError(403, 'You do not have permission for this action.', 'FORBIDDEN');
  }
  return actor.volunteerId;
}

/**
 * Volunteers may file time requests only after full onboarding: registration
 * approved, email verified, AND the 10-check profile completion at 100%
 * (identity verification is an administrator verdict). Mirrors the prototype's
 * "locked until onboarding complete" rule; the completion percentage is the
 * Phase 5 server-side computation (see modules/volunteers/profile.ts).
 */
async function assertRequestsUnlocked(volunteerId: string): Promise<{ branchId: string }> {
  const volunteer = await findVolunteerGate(volunteerId);
  if (!volunteer) throw notFound('Volunteer not found.');
  const completion = await computeProfileCompletion(volunteerId);
  const complete =
    volunteer.status === 'approved' && volunteer.emailVerified && completion?.percent === 100;
  if (!complete) {
    throw new ApiError(
      403,
      'Time requests are locked until onboarding is complete: approved registration, verified email, and a complete profile (including identity verification).',
      'TIME_REQUESTS_LOCKED',
    );
  }
  return volunteer;
}

/** Optional assignment must target an ACTIVE admin of the volunteer's own branch. */
async function assertAssignedAdmin(assignedAdminId: string | undefined, branchId: string): Promise<void> {
  if (!assignedAdminId) return;
  const admin = await findActiveAdminInBranch(assignedAdminId, branchId);
  if (!admin) throw new ApiError(400, 'The selected administrator is unavailable for this branch.', 'INVALID_ASSIGNED_ADMIN');
}

export async function getVolunteerTimeRecords(actor: SessionActor) {
  const records = await listServiceRecords(ensureVolunteerId(actor));
  return { records };
}

// All totals are computed on the server; the SPA renders them verbatim.
export async function getVolunteerTimeSummary(actor: SessionActor) {
  const volunteerId = ensureVolunteerId(actor);
  const [approved, pending] = await Promise.all([getApprovedTotals(volunteerId), getPendingAddTotals(volunteerId)]);
  return {
    summary: {
      totalMinutes: approved.totalMinutes,
      serviceDays: approved.serviceDays,
      pendingMinutes: pending.pendingMinutes,
      pendingRequests: pending.pendingRequests,
    },
  };
}

export async function listVolunteerTimeAdmins(actor: SessionActor) {
  const volunteer = await findVolunteerGate(ensureVolunteerId(actor));
  if (!volunteer) throw notFound('Volunteer not found.');
  const items = await listActiveBranchAdmins(volunteer.branchId);
  return { items };
}

export async function listVolunteerTimeRequests(actor: SessionActor) {
  const requests = await listAddTimeRequests(ensureVolunteerId(actor));
  return { requests };
}

export async function listVolunteerEditTimeRequests(actor: SessionActor) {
  const requests = await listEditTimeRequests(ensureVolunteerId(actor));
  return { requests };
}

export async function createVolunteerAddTimeRequest(
  actor: SessionActor,
  input: CreateAddTimeRequestInput,
  ip?: string,
) {
  const volunteerId = ensureVolunteerId(actor);
  const volunteer = await assertRequestsUnlocked(volunteerId);
  await assertAssignedAdmin(input.assignedAdminId, volunteer.branchId);

  try {
    const created = await createAddTimeRequest({
      volunteerId,
      branchId: volunteer.branchId,
      assignedAdminId: input.assignedAdminId ?? null,
      date: parseDateString(input.date),
      event: input.event,
      minutes: input.minutes,
    });
    await createAudit({
      actorType: 'volunteer',
      actorId: volunteerId,
      actorName: actor.displayName,
      actorRole: 'volunteer',
      action: 'time.add_request_created',
      targetType: 'timeAddRequest',
      targetId: created.id,
      branchId: volunteer.branchId,
      ipAddress: ip,
      metadata: { date: input.date, event: input.event, minutes: input.minutes, assignedAdminId: input.assignedAdminId ?? null },
    });
    return { request: created };
  } catch (err) {
    // DB backstop: one pending request per (volunteer, date, event, minutes).
    if (isDuplicateKey(err)) {
      throw conflict('A similar pending request already exists.', 'DUPLICATE_TIME_REQUEST');
    }
    throw err;
  }
}

export async function createVolunteerEditTimeRequest(
  actor: SessionActor,
  input: CreateEditTimeRequestInput,
  ip?: string,
) {
  const volunteerId = ensureVolunteerId(actor);
  const volunteer = await assertRequestsUnlocked(volunteerId);
  await assertAssignedAdmin(input.assignedAdminId, volunteer.branchId);

  // Ownership is enforced here (volunteerId scoped), so an IDOR attempt on
  // another volunteer's record resolves as a plain 404.
  const record = await findServiceRecordForVolunteer(input.recordId, volunteerId);
  if (!record) throw notFound('Approved time record not found.');

  // Prototype rule, enforced server-side: corrections are allowed only within
  // the window after the service date. `record.date` is a UTC-midnight Date.
  const recordDay = new Date(`${record.date.toISOString().slice(0, 10)}T00:00:00.000Z`).getTime();
  const ageDays = Math.floor((Date.now() - recordDay) / 86_400_000);
  if (ageDays > config.time.editRequestWindowDays) {
    throw new ApiError(
      400,
      `Edit requests are allowed only within ${config.time.editRequestWindowDays} days of the service date.`,
      'EDIT_REQUEST_WINDOW_EXPIRED',
    );
  }

  try {
    const created = await createEditTimeRequest({
      volunteerId,
      recordId: record.id,
      branchId: volunteer.branchId,
      assignedAdminId: input.assignedAdminId ?? null,
      requestedDate: parseDateString(input.date),
      requestedEvent: input.event,
      requestedMinutes: input.minutes,
      reason: input.reason,
      // The original values are snapshotted verbatim; the live record is NOT
      // changed until an admin approves the request (Phase 5).
      originalDate: record.date,
      originalEvent: record.event,
      originalMinutes: record.minutes,
    });
    await createAudit({
      actorType: 'volunteer',
      actorId: volunteerId,
      actorName: actor.displayName,
      actorRole: 'volunteer',
      action: 'time.edit_request_created',
      targetType: 'timeEditRequest',
      targetId: created.id,
      branchId: volunteer.branchId,
      ipAddress: ip,
      metadata: {
        recordId: record.id,
        requestedDate: input.date,
        requestedEvent: input.event,
        requestedMinutes: input.minutes,
        reason: input.reason,
        assignedAdminId: input.assignedAdminId ?? null,
      },
    });
    return { request: created };
  } catch (err) {
    // DB backstop: one pending edit request per record.
    if (isDuplicateKey(err)) {
      throw conflict('An edit request for this record is already pending.', 'EDIT_REQUEST_ALREADY_PENDING');
    }
    throw err;
  }
}
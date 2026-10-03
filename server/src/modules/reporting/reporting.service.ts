import { Prisma } from '@prisma/client';
import { ApiError, notFound } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import type { SessionActor } from '../../middleware/auth';
import { createAudit } from '../auth/auth.repository';
import {
  createServiceReport,
  createVerificationReference,
  findReportVolunteer,
  findVerificationReference,
  getLiveApprovedTotals,
  listApprovedRecords,
  listServiceReportsByVolunteer,
  countServiceReportsByVolunteer,
  revokeServiceReport,
} from './reporting.repository';

function adminAuditBase(actor: SessionActor) {
  return {
    actorType: 'admin' as const,
    actorId: actor.adminId,
    actorName: actor.displayName,
    actorRole: actor.role,
  };
}

// Fail closed: a branch admin can only reach their own branch's volunteers.
function assertBranchScope(actor: SessionActor, resourceBranchId: string): void {
  if (!actor.isHq && actor.branchId !== resourceBranchId) {
    throw new ApiError(403, 'This resource belongs to another branch.', 'BRANCH_SCOPE_VIOLATION');
  }
}

// Frozen snapshot derivation from the approved records. recordCount counts
// every approved row (including negative official adjustments); serviceDays
// counts distinct calendar dates carrying positive minutes; totalMinutes is
// the signed sum. All server-side — the SPA never sums. Exported so the
// pre-6.1 backfill produces exactly the same numbers as live generation.
export function deriveSnapshot(records: { date: Date; minutes: number }[]): {
  totalMinutes: number;
  serviceDayCount: number;
} {
  const totalMinutes = records.reduce((acc, r) => acc + r.minutes, 0);
  const serviceDayCount = new Set(records.filter((r) => r.minutes > 0).map((r) => r.date.toISOString().slice(0, 10)))
    .size;
  return { totalMinutes, serviceDayCount };
}

/**
 * Generates a single-volunteer service-hours credential. The approved totals
 * are computed server-side AND FROZEN onto a service_reports row at this
 * moment (Phase 6.1): public verification returns exactly these numbers for
 * the life of the credential, so a printed QR always matches the paper.
 * Generation writes an audit row and issues a fresh opaque verification
 * reference whose raw value is returned exactly once, for the report's QR
 * link. Unlike the hashed access tokens (email verification, application
 * access), the reference is stored in plain text on purpose: it is a public
 * verifier handle, not a secret, and it can reach nothing but a
 * self-description.
 */
export async function generateServiceReport(actor: SessionActor, volunteerId: string, ip?: string) {
  const volunteer = await findReportVolunteer(volunteerId);
  if (!volunteer) throw notFound('Volunteer not found.');
  assertBranchScope(actor, volunteer.branchId);

  const records = await listApprovedRecords(volunteer.id);
  const { totalMinutes, serviceDayCount } = deriveSnapshot(records);

  const reference = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await createVerificationReference(tx, {
      scope: 'service_report',
      targetType: 'volunteer',
      targetId: volunteer.id,
    });
    await createServiceReport(tx, {
      referenceId: created.id,
      volunteerId: volunteer.id,
      branchId: volunteer.branchId,
      issuedAt: created.issuedAt,
      approvedMinutes: totalMinutes,
      recordCount: records.length,
      serviceDayCount,
    });
    await createAudit(
      {
        ...adminAuditBase(actor),
        action: 'report.generated',
        targetType: 'volunteer',
        targetId: volunteer.id,
        branchId: volunteer.branchId,
        ipAddress: ip,
        metadata: {
          code: volunteer.code,
          recordCount: records.length,
          serviceDayCount,
          totalMinutes,
          ref: created.ref,
        },
      },
      tx,
    );
    return created;
  });

  return {
    report: {
      generatedAt: reference.issuedAt.toISOString(),
      volunteer: {
        id: volunteer.id,
        code: volunteer.code,
        englishName: volunteer.englishName,
        arabicName: volunteer.arabicName,
        branchId: volunteer.branchId,
      },
      branch: {
        id: volunteer.branch.id,
        code: volunteer.branch.code,
        nameEn: volunteer.branch.nameEn,
        nameAr: volunteer.branch.nameAr,
      },
      // Server-computed; the SPA renders these verbatim.
      recordCount: records.length,
      totalMinutes,
      serviceDayCount,
      records: records.map((r) => ({
        id: r.id,
        date: r.date.toISOString().slice(0, 10),
        event: r.event,
        minutes: r.minutes,
      })),
    },
    verification: { ref: reference.ref },
  };
}

/**
 * Public verification lookup: given an opaque ref, describe what the credential
 * certifies — the FROZEN snapshot recorded at generation, never a live
 * recomputation (Phase 6.1). Returns ONLY verifier-appropriate fields (name,
 * code, report totals, issued-at) — no email, phone, national ID, or internal
 * ids. Unknown references, references without a report row, and REVOKED
 * reports all resolve to the SAME 404 so the endpoint never reveals whether a
 * ref merely doesn't exist or was revoked.
 */
export async function verifyServiceReportRef(ref: string) {
  const reference = await findVerificationReference(ref);
  const report = reference?.serviceReport;
  if (!reference || reference.scope !== 'service_report' || !report || report.revokedAt) {
    throw notFound('This verification reference is not valid.');
  }

  const volunteer = await findReportVolunteer(report.volunteerId);
  if (!volunteer) throw notFound('This verification reference is not valid.');

  return {
    valid: true,
    reference: {
      scope: reference.scope,
      issuedAt: report.issuedAt.toISOString(),
    },
    volunteer: {
      code: volunteer.code,
      englishName: volunteer.englishName,
      arabicName: volunteer.arabicName,
    },
    report: {
      approvedTotalMinutes: report.approvedMinutes,
      recordCount: report.recordCount,
      serviceDayCount: report.serviceDayCount,
    },
  };
}

/**
 * Admin revocation — per-report, branch-scoped, audited. Revoking flips the
 * credential's own revokedAt; public verification then returns the same 404 as
 * an unknown ref (no enumeration). A report cannot be revoked twice.
 */
export async function revokeReport(actor: SessionActor, ref: string, reason: string | null, ip?: string) {
  const reference = await findVerificationReference(ref);
  const report = reference?.serviceReport;
  if (!reference || reference.scope !== 'service_report' || !report) {
    throw notFound('Service report not found.');
  }

  const volunteer = await findReportVolunteer(report.volunteerId);
  if (!volunteer) throw notFound('Service report not found.');
  assertBranchScope(actor, volunteer.branchId);

  if (report.revokedAt) {
    throw new ApiError(409, 'This service report is already revoked.', 'SERVICE_REPORT_ALREADY_REVOKED');
  }

  const revoked = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await revokeServiceReport(report.id, {
      revokedBy: actor.displayName ?? actor.adminId ?? 'Admin',
      revocationReason: reason,
    });
    await createAudit(
      {
        ...adminAuditBase(actor),
        action: 'service_report.revoked',
        targetType: 'volunteer',
        targetId: volunteer.id,
        branchId: volunteer.branchId,
        ipAddress: ip,
        metadata: {
          code: volunteer.code,
          ref,
          reason,
        },
      },
      tx,
    );
    return updated;
  });

  return { revoked: true, ref, revokedAt: revoked.revokedAt!.toISOString() };
}

/**
 * Admin-only report list for one volunteer: each row pairs the FROZEN snapshot
 * with the volunteer's CURRENT (live) totals so an admin can see "this report
 * said 120, they're now at 135". The live totals never reach the public
 * endpoint. Branch-scoped like every other admin face.
 */
export async function listVolunteerReports(actor: SessionActor, volunteerId: string, page: number, pageSize: number) {
  const volunteer = await findReportVolunteer(volunteerId);
  if (!volunteer) throw notFound('Volunteer not found.');
  assertBranchScope(actor, volunteer.branchId);

  const [rows, total, live] = await Promise.all([
    listServiceReportsByVolunteer(volunteerId, page, pageSize),
    countServiceReportsByVolunteer(volunteerId),
    getLiveApprovedTotals(volunteerId),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      ref: row.reference.ref,
      issuedAt: row.issuedAt.toISOString(),
      approvedMinutes: row.approvedMinutes,
      recordCount: row.recordCount,
      serviceDayCount: row.serviceDayCount,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      revokedBy: row.revokedBy,
      revocationReason: row.revocationReason,
      ...live,
    })),
    meta: { page, pageSize, total },
  };
}

// Phase 6.2: pre-6.1 service_report references have no snapshot row and so
// verify to the same 404 as unknown/revoked. The decided remediation (see
// docs/SECURITY.md "Service-report backfill decision") freezes each orphaned
// ref to a snapshot of the CURRENT live ledger at migration time — an
// approximation of "what the ledger means today", never a reconstruction of
// the value true on issue day. Idempotent: it only ever touches
// scope='service_report' references with no report row yet, writes one audited
// `service_report.backfilled` row per backfilled reference (actorType
// 'system'), and can be re-run safely.
export const SNAPSHOT_ORIGIN_BACKFILL = 'migration-live-backfill' as const;
export const BACKFILL_MIGRATION_NAME = '20260923140000_backfill_service_report_origin' as const;

export interface BackfillServiceReportsResult {
  processed: number;
  skipped: number;
  referencedVolunteers: number;
  refs: {
    ref: string;
    code: string;
    totalMinutes: number;
    recordCount: number;
    serviceDayCount: number;
  }[];
}

export async function backfillServiceReportsFromLiveTotals(): Promise<BackfillServiceReportsResult> {
  const orphaned = await prisma.verificationReference.findMany({
    where: { scope: 'service_report', serviceReport: { is: null } },
    select: { id: true, ref: true, targetId: true, issuedAt: true },
    orderBy: { issuedAt: 'asc' },
  });

  const volunteerIds = [...new Set(orphaned.map((o) => o.targetId))];
  const volunteers = await prisma.volunteer.findMany({
    where: { id: { in: volunteerIds } },
    select: { id: true, code: true, branchId: true },
  });
  const volunteerById = new Map(volunteers.map((v) => [v.id, v]));

  // One migration-moment clock read shared across every backfilled row so the
  // whole batch carries a single honest "taken at" time.
  const issuedAt = new Date();

  const refs: BackfillServiceReportsResult['refs'] = [];
  let skipped = 0;

  for (const reference of orphaned) {
    const volunteer = volunteerById.get(reference.targetId);
    if (!volunteer) {
      skipped += 1;
      continue;
    }
    const records = await listApprovedRecords(volunteer.id);
    const { totalMinutes, serviceDayCount } = deriveSnapshot(records);

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await createServiceReport(tx, {
        referenceId: reference.id,
        volunteerId: volunteer.id,
        branchId: volunteer.branchId,
        issuedAt,
        approvedMinutes: totalMinutes,
        recordCount: records.length,
        serviceDayCount,
        snapshotOrigin: SNAPSHOT_ORIGIN_BACKFILL,
      });
      await createAudit(
        {
          actorType: 'system',
          actorName: 'migration-backfill',
          action: 'service_report.backfilled',
          targetType: 'volunteer',
          targetId: volunteer.id,
          branchId: volunteer.branchId,
          metadata: {
            ref: reference.ref,
            code: volunteer.code,
            recordCount: records.length,
            serviceDayCount,
            totalMinutes,
            origin: SNAPSHOT_ORIGIN_BACKFILL,
            migration: BACKFILL_MIGRATION_NAME,
          },
        },
        tx,
      );
    });

    refs.push({
      ref: reference.ref,
      code: volunteer.code,
      totalMinutes,
      recordCount: records.length,
      serviceDayCount,
    });
  }

  return { processed: refs.length, skipped, referencedVolunteers: volunteerIds.length, refs };
}
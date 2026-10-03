import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

// Phase 6: service reports + verification references. Phase 6.1: each report
// now freezes its snapshot on a service_reports row and carries per-report
// revocation. Reporting reads are plain SELECTs; the only writes are the
// append-only audit row, the verification_references insert, and the
// service_reports insert/revoke that accompany report life.

export function findReportVolunteer(volunteerId: string) {
  return prisma.volunteer.findUnique({
    where: { id: volunteerId },
    select: {
      id: true,
      code: true,
      englishName: true,
      arabicName: true,
      branchId: true,
      branch: { select: { id: true, code: true, nameEn: true, nameAr: true } },
    },
  });
}

export function listApprovedRecords(volunteerId: string) {
  return prisma.serviceTimeRecord.findMany({
    where: { volunteerId },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, date: true, event: true, minutes: true },
  });
}

export function createVerificationReference(
  tx: Prisma.TransactionClient,
  data: { scope: string; targetId: string; targetType: string },
) {
  // 192-bit opaque token; only this digest-less raw value is ever persisted,
  // and it is returned to the generating admin (and embedded in the report's
  // QR URL) — never exposed elsewhere.
  const ref = randomBytes(24).toString('hex');
  return tx.verificationReference.create({ data: { ref, ...data } });
}

// Phase 6.1: the reference lookup carries its report row, so every consumer
// (public verify, admin revoke) sees the same frozen snapshot + revocation in
// one query. A scope='service_report' reference WITHOUT a report row is
// impossible through the API but treated as 404 everywhere for safety.
export function findVerificationReference(ref: string) {
  return prisma.verificationReference.findUnique({
    where: { ref },
    select: {
      id: true,
      ref: true,
      scope: true,
      targetId: true,
      targetType: true,
      issuedAt: true,
      revokedAt: true,
      serviceReport: {
        select: {
          id: true,
          volunteerId: true,
          branchId: true,
          issuedAt: true,
          approvedMinutes: true,
          recordCount: true,
          serviceDayCount: true,
          revokedAt: true,
          revokedBy: true,
          revocationReason: true,
        },
      },
    },
  });
}

export function createServiceReport(
  tx: Prisma.TransactionClient,
  data: {
    referenceId: string;
    volunteerId: string;
    branchId: string;
    issuedAt: Date;
    approvedMinutes: number;
    recordCount: number;
    serviceDayCount: number;
    // Phase 6.2: NULL for live issuance; the backfill script sets its origin.
    snapshotOrigin?: string | null;
  },
) {
  return tx.serviceReport.create({ data });
}

// Admin-facing list: frozen snapshot + the volunteer's LIVE totals side by
// side. The live numbers are admin-only; the public endpoint never sees them.
export function listServiceReportsByVolunteer(
  volunteerId: string,
  page: number,
  pageSize: number,
) {
  return prisma.serviceReport.findMany({
    where: { volunteerId },
    orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      issuedAt: true,
      approvedMinutes: true,
      recordCount: true,
      serviceDayCount: true,
      revokedAt: true,
      revokedBy: true,
      revocationReason: true,
      reference: { select: { ref: true } },
    },
  });
}

export function countServiceReportsByVolunteer(volunteerId: string) {
  return prisma.serviceReport.count({ where: { volunteerId } });
}

// Live totals for the admin comparison column (server-computed, admin-only).
export async function getLiveApprovedTotals(volunteerId: string) {
  const [aggregate, recordCount, serviceDayCount] = await Promise.all([
    prisma.serviceTimeRecord.aggregate({ where: { volunteerId }, _sum: { minutes: true } }),
    prisma.serviceTimeRecord.count({ where: { volunteerId } }),
    prisma.serviceTimeRecord.groupBy({ by: ['date'], where: { volunteerId, minutes: { gt: 0 } } }),
  ]);
  return {
    currentApprovedMinutes: aggregate._sum.minutes ?? 0,
    currentRecordCount: recordCount,
    currentServiceDayCount: serviceDayCount.length,
  };
}

export function revokeServiceReport(
  reportId: string,
  data: { revokedBy: string; revocationReason: string | null },
) {
  return prisma.serviceReport.update({
    where: { id: reportId },
    data: { revokedAt: new Date(), ...data },
    select: { id: true, revokedAt: true, revokedBy: true, revocationReason: true },
  });
}
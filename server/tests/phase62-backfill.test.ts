import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request, { SuperAgentTest } from 'supertest';
import { buildApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/password';
import { ADMIN_PASSWORD, seedAuthFixtures } from './helpers';
import {
  BACKFILL_MIGRATION_NAME,
  SNAPSHOT_ORIGIN_BACKFILL,
  backfillServiceReportsFromLiveTotals,
} from '../src/modules/reporting/reporting.service';

type Agent = SuperAgentTest;

const app = buildApp();

async function fetchCsrf(agent: Agent): Promise<string> {
  const res = await agent.get('/api/auth/csrf-token').expect(200);
  return res.body.csrfToken as string;
}

async function login(agent: Agent, identifier: string, password: string): Promise<string> {
  const csrf = await fetchCsrf(agent);
  const res = await agent.post('/api/auth/login').set('x-csrf-token', csrf).send({ identifier, password }).expect(200);
  return res.body.csrfToken as string;
}

function newAgent(): Agent {
  return request.agent(app);
}

function dateNDaysAgo(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function randomRef(): string {
  return randomBytes(24).toString('hex');
}

// Phase 6.2: the pre-6.1 backfill decision, implemented. Orphaned
// scope='service_report' references (no snapshot row) are frozen to the
// volunteer's LIVE ledger totals at migration time, marked snapshot_origin =
// 'migration-live-backfill', and each backfill is itself an audited event.
describe('Phase 6.2: pre-6.1 service-report backfill', () => {
  let branchAId: string;
  let volunteerAId: string;
  let orphanRefA1: string;
  let orphanRefA2: string;
  let orphanRefB: string;
  let adminLogRefId: string;
  const hq = newAgent();

  beforeAll(async () => {
    const fixtures = await seedAuthFixtures();
    branchAId = fixtures.branchId;
    volunteerAId = fixtures.volunteerId;

    // Live ledger for volunteer A: +90 (approved event) and -30 (official
    // adjustment) => 60 minutes / 2 records / 1 service day (only the +90 day
    // is a service day).
    await prisma.serviceTimeRecord.create({
      data: {
        volunteerId: volunteerAId,
        branchId: branchAId,
        date: dateNDaysAgo(3),
        event: 'Blood drive',
        minutes: 90,
        source: 'add_request',
      },
    });
    await prisma.serviceTimeRecord.create({
      data: {
        volunteerId: volunteerAId,
        branchId: branchAId,
        date: dateNDaysAgo(1),
        event: 'Official correction',
        minutes: -30,
        source: 'admin_adjustment',
        reason: 'Overstated entry corrected.',
      },
    });

    // A second volunteer so the backfill is proven multi-volunteer (+45 / 1 / 1).
    const passwordHash = await hashPassword(ADMIN_PASSWORD);
    const branchB = await prisma.branch.create({
      data: { code: 'ERC-P62B', nameEn: 'Branch P6.2 Beta', nameAr: 'فرع بيتا' },
    });
    const volunteerB = await prisma.volunteer.create({
      data: {
        branchId: branchB.id,
        code: 'ERC-TEST-2',
        englishName: 'Volunteer Two',
        email: 'volunteer2@erc.local',
        passwordHash,
        status: 'approved',
      },
    });
    await prisma.serviceTimeRecord.create({
      data: {
        volunteerId: volunteerB.id,
        branchId: branchB.id,
        date: dateNDaysAgo(2),
        event: 'Beta drive',
        minutes: 45,
        source: 'add_request',
      },
    });

    // The pre-6.1 orphaned references, written directly the way the Phase 6
    // generation path would have left them (reference WITHOUT a report row).
    const refARow1 = await prisma.verificationReference.create({
      data: { ref: randomRef(), scope: 'service_report', targetType: 'volunteer', targetId: volunteerAId },
    });
    orphanRefA1 = refARow1.ref;
    const refARow2 = await prisma.verificationReference.create({
      data: { ref: randomRef(), scope: 'service_report', targetType: 'volunteer', targetId: volunteerAId },
    });
    orphanRefA2 = refARow2.ref;
    const refBRow = await prisma.verificationReference.create({
      data: { ref: randomRef(), scope: 'service_report', targetType: 'volunteer', targetId: volunteerB.id },
    });
    orphanRefB = refBRow.ref;

    // A non-report scope reference must be left untouched by the backfill.
    const adminLogRow = await prisma.verificationReference.create({
      data: { ref: randomRef(), scope: 'admin_log', targetType: 'admin', targetId: fixtures.hqAdminId },
    });
    adminLogRefId = adminLogRow.id;

    await login(hq, 'admin', ADMIN_PASSWORD);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('reports the pre-backfill state: orphaned refs 404 exactly like unknown refs', async () => {
    await newAgent().get(`/api/verify/${orphanRefA1}`).expect(404);
    await newAgent().get(`/api/verify/${orphanRefA2}`).expect(404);
    await newAgent().get(`/api/verify/${orphanRefB}`).expect(404);
  });

  it('backfills every orphaned service_report ref from live totals and the refs verify', async () => {
    const result = await backfillServiceReportsFromLiveTotals();
    expect(result).toMatchObject({ processed: 3, skipped: 0, referencedVolunteers: 2 });

    const verifiedA = await newAgent().get(`/api/verify/${orphanRefA1}`).expect(200);
    expect(verifiedA.body.valid).toBe(true);
    expect(verifiedA.body.reference.scope).toBe('service_report');
    expect(verifiedA.body.report).toEqual({ approvedTotalMinutes: 60, recordCount: 2, serviceDayCount: 1 });
    expect(verifiedA.body.volunteer).toEqual({
      code: 'ERC-TEST-1',
      englishName: 'Volunteer One',
      arabicName: null,
    });

    const verifiedA2 = await newAgent().get(`/api/verify/${orphanRefA2}`).expect(200);
    expect(verifiedA2.body.report.approvedTotalMinutes).toBe(60);

    const verifiedB = await newAgent().get(`/api/verify/${orphanRefB}`).expect(200);
    expect(verifiedB.body.report).toEqual({ approvedTotalMinutes: 45, recordCount: 1, serviceDayCount: 1 });
    expect(verifiedB.body.volunteer.code).toBe('ERC-TEST-2');
  });

  it('marks backfilled rows snapshot_origin=migration-live-backfill', async () => {
    const row = await prisma.serviceReport.findFirst({
      where: { reference: { ref: orphanRefA1 } },
      select: { snapshotOrigin: true },
    });
    expect(row?.snapshotOrigin).toBe(SNAPSHOT_ORIGIN_BACKFILL);
  });

  it('audits each backfill as an immutable system event', async () => {
    const row = await prisma.auditLog.findFirst({
      where: { action: 'service_report.backfilled' },
      orderBy: { createdAt: 'asc' },
    });
    expect(row).toBeTruthy();
    expect(row?.actorType).toBe('system');
    expect(row?.actorName).toBe('migration-backfill');
    expect(row?.targetType).toBe('volunteer');
    expect(row?.branchId).toBe(branchAId);
    const meta = row?.metadata as { ref?: string; origin?: string; migration?: string };
    expect(meta.origin).toBe(SNAPSHOT_ORIGIN_BACKFILL);
    expect(meta.migration).toBe(BACKFILL_MIGRATION_NAME);
  });

  it('is idempotent on re-run and leaves no duplicate rows or audit events', async () => {
    const again = await backfillServiceReportsFromLiveTotals();
    expect(again.processed).toBe(0);
    expect(again.skipped).toBe(0);

    const snapshotCount = await prisma.serviceReport.count({ where: { reference: { ref: orphanRefA1 } } });
    expect(snapshotCount).toBe(1);
    const auditCount = await prisma.auditLog.count({
      where: { action: 'service_report.backfilled', metadata: { path: ['ref'], equals: orphanRefA1 } },
    });
    expect(auditCount).toBe(1);
  });

  it('leaves admin_log-scoped references untouched', async () => {
    const count = await prisma.serviceReport.count({ where: { referenceId: adminLogRefId } });
    expect(count).toBe(0);
  });

  it('backfilled snapshots stay frozen: later ledger changes never move verify', async () => {
    await prisma.serviceTimeRecord.create({
      data: {
        volunteerId: volunteerAId,
        branchId: branchAId,
        date: dateNDaysAgo(5),
        event: 'Post-backfill record',
        minutes: 45,
        source: 'add_request',
      },
    });

    const still = await newAgent().get(`/api/verify/${orphanRefA1}`).expect(200);
    expect(still.body.report).toEqual({ approvedTotalMinutes: 60, recordCount: 2, serviceDayCount: 1 });

    // A report generated live after the backfill sees the mutated ledger and
    // carries NO origin marker (it was issued through the API, not the script).
    const generated = await hq.get(`/api/admin/reports/volunteers/${volunteerAId}/report`).expect(200);
    expect(generated.body.report).toMatchObject({ totalMinutes: 105, recordCount: 3 });
    const liveRef = generated.body.verification.ref as string;
    const liveRow = await prisma.serviceReport.findFirst({
      where: { reference: { ref: liveRef } },
      select: { snapshotOrigin: true },
    });
    expect(liveRow?.snapshotOrigin).toBeNull();
  });
});
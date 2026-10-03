import { describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/password';
import { resetDb } from './helpers';

// These tests exercise the database-level safeguards added by the
// 0002_db_check_constraints migration directly against a real Postgres.
describe('database CHECK constraints', () => {
  it('registrations reject an out-of-vocabulary status', async () => {
    await resetDb();
    await expect(
      createBaseRegistration({ status: 'bogus_status' }),
    ).rejects.toThrow(/check|constraint|violat/i);
  });

  it('registrations reject a malformed email', async () => {
    await resetDb();
    await expect(createBaseRegistration({ email: 'not-an-email' })).rejects.toThrow(/email|constraint/i);
  });

  it('service_time_records reject zero minutes', async () => {
    const ctx = await fixtureContext();
    await expect(
      prisma.serviceTimeRecord.create({
        data: {
          volunteerId: ctx.volunteerId,
          branchId: ctx.branchId,
          date: new Date('2026-01-05'),
          event: 'Event',
          minutes: 0,
        },
      }),
    ).rejects.toThrow(/check|constraint/i);
  });

  it('service_time_records accept a negative (official adjustment) value', async () => {
    const ctx = await fixtureContext();
    const record = await prisma.serviceTimeRecord.create({
      data: {
        volunteerId: ctx.volunteerId,
        branchId: ctx.branchId,
        date: new Date('2026-01-05'),
        event: 'Admin correction',
        minutes: -60,
        source: 'admin_adjustment',
        reason: 'Over-credited by previous event.',
      },
    });
    expect(record.minutes).toBe(-60);
  });

  it('admin_time_adjustments reject an empty reason', async () => {
    const ctx = await fixtureContext();
    await expect(
      prisma.adminTimeAdjustment.create({
        data: {
          adminId: ctx.hqAdminId,
          volunteerId: ctx.volunteerId,
          branchId: ctx.branchId,
          date: new Date('2026-01-05'),
          event: 'Correction',
          deltaMinutes: -30,
          reason: '   ',
        },
      }),
    ).rejects.toThrow(/check|constraint/i);
  });

  it('documents require exactly one owner (volunteer XOR registration)', async () => {
    const ctx = await fixtureContext();
    await expect(
      prisma.document.create({
        data: {
          branchId: ctx.branchId,
          objectKey: 'k1',
          originalName: 'a.png',
          contentType: 'image/png',
          sizeBytes: 10,
          category: 'photo',
        },
      }),
    ).rejects.toThrow(/check|constraint/i);
  });

  it('at most one pending edit request exists per record', async () => {
    const ctx = await fixtureContext();
    const record = await prisma.serviceTimeRecord.create({
      data: {
        volunteerId: ctx.volunteerId,
        branchId: ctx.branchId,
        date: new Date('2026-01-05'),
        event: 'Event A',
        minutes: 120,
      },
    });
    await prisma.timeEditRequest.create({
      data: {
        volunteerId: ctx.volunteerId,
        recordId: record.id,
        branchId: ctx.branchId,
        requestedDate: new Date('2026-01-06'),
        requestedEvent: 'Event B',
        requestedMinutes: 150,
        reason: 'Typo on date.',
        originalDate: new Date('2026-01-05'),
        originalEvent: 'Event A',
        originalMinutes: 120,
      },
    });
    await expect(
      prisma.timeEditRequest.create({
        data: {
          volunteerId: ctx.volunteerId,
          recordId: record.id,
          branchId: ctx.branchId,
          requestedDate: new Date('2026-01-07'),
          requestedEvent: 'Event C',
          requestedMinutes: 90,
          reason: 'Second pending correction.',
          originalDate: new Date('2026-01-05'),
          originalEvent: 'Event A',
          originalMinutes: 120,
        },
      }),
    ).rejects.toThrow(/duplicate|unique/i);
  });
});

describe('audit log is append-only', () => {
  it('blocks UPDATE', async () => {
    await resetDb();
    const ctx = await fixtureContext();
    const entry = await prisma.auditLog.create({
      data: {
        actorType: 'system',
        action: 'test.insert',
        branchId: ctx.branchId,
      },
    });
    await expect(
      prisma.auditLog.update({ where: { id: entry.id }, data: { action: 'test.tampered' } }),
    ).rejects.toThrow(/append-only/i);
  });

  it('blocks DELETE', async () => {
    await resetDb();
    const entry = await prisma.auditLog.create({
      data: { actorType: 'system', action: 'test.insert-2' },
    });
    await expect(prisma.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow(/append-only/i);
  });

  it('blocks TRUNCATE (statement-level guard)', async () => {
    await resetDb();
    await expect(prisma.$executeRawUnsafe('TRUNCATE TABLE "audit_logs";')).rejects.toThrow(
      /append-only|TRUNCATE/i,
    );
  });
});

async function fixtureContext() {
  const passwordHash = await hashPassword('admin123!');
  const suffix = Math.random().toString(36).slice(2, 8);
  const branch = await prisma.branch.create({
    data: { code: `DB-TEST-${suffix}`, nameEn: 'DB Test', nameAr: 'اختبار' },
  });
  const hq = await prisma.admin.create({
    data: {
      username: `db-hq-${suffix}`,
      fullNameEn: 'DB HQ',
      email: `db-hq-${suffix}@erc.local`,
      passwordHash,
      role: 'hq_admin',
      branchId: null,
    },
  });
  const volunteer = await prisma.volunteer.create({
    data: {
      branchId: branch.id,
      code: `ERC-DBTEST-${suffix}`,
      englishName: 'DB Volunteer',
      email: `db-vol-${suffix}@erc.local`,
      passwordHash,
      status: 'approved',
    },
  });
  return { branchId: branch.id, hqAdminId: hq.id, volunteerId: volunteer.id };
}

async function createBaseRegistration(overrides: Record<string, unknown>) {
  const passwordHash = await hashPassword('admin123!');
  const branch = await prisma.branch.create({
    data: { code: `B-${Math.random().toString(36).slice(2, 8)}`, nameEn: 'B', nameAr: 'ب' },
  });
  return prisma.registration.create({
    data: {
      branchId: branch.id,
      englishName: 'Applicant',
      email: 'applicant@erc.local',
      phone: '01000000000',
      passwordHash,
      ...overrides,
    },
  });
}
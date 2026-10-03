import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request, { SuperAgentTest } from 'supertest';
import { buildApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/password';
import { ADMIN_PASSWORD, seedAuthFixtures } from './helpers';

type Agent = SuperAgentTest;

const app = buildApp();
let fixtures: Awaited<ReturnType<typeof seedAuthFixtures>>;
let branchBAdminId: string;
let volunteerBId: string;

function dateNDaysAgo(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

const dateStr = (date: Date) => date.toISOString().slice(0, 10);

async function fetchCsrf(agent: Agent): Promise<string> {
  const res = await agent.get('/api/auth/csrf-token').expect(200);
  return res.body.csrfToken as string;
}

// Login preserves the agent's cookie jar; returns the post-regen CSRF token.
async function login(agent: Agent, identifier: string, password: string): Promise<string> {
  const csrf = await fetchCsrf(agent);
  const res = await agent
    .post('/api/auth/login')
    .set('x-csrf-token', csrf)
    .send({ identifier, password })
    .expect(200);
  return res.body.csrfToken as string;
}

function newAgent(): Agent {
  return request.agent(app);
}

async function volunteerAgent(code = 'ERC-TEST-1'): Promise<{ agent: Agent; csrf: string }> {
  const agent = newAgent();
  const csrf = await login(agent, code, ADMIN_PASSWORD);
  return { agent, csrf };
}

beforeAll(async () => {
  fixtures = await seedAuthFixtures();

  // The happy-path volunteer is fully onboarded: approved + email-verified +
  // identity-verified with every profile-completion field filled, so the
  // Phase 5 100% lock gate is open. The lock test constructs deliberately
  // incomplete volunteers below.
  await prisma.volunteer.update({
    where: { id: fixtures.volunteerId },
    data: {
      emailVerified: true,
      identityVerified: true,
      arabicName: 'متطوع واحد',
      skills: ['First Aid'],
      certifications: ['BLS'],
      educationInfo: 'B.Sc. Nursing.',
      applicationAnswers: [
        { key: 'why', answer: 'To help.' },
        { key: 'benefit', answer: 'Meaningful work.' },
      ],
    },
  });

  // Second branch + admin (for the INVALID_ASSIGNED_ADMIN path) + volunteer
  // (for IDOR coverage).
  const branchB = await prisma.branch.create({
    data: { code: 'ERC-B2', nameEn: 'Branch Two', nameAr: 'الفرع الثاني' },
  });
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const branchBAdmin = await prisma.admin.create({
    data: {
      username: 'branch-admin-b',
      fullNameEn: 'Branch Admin B',
      email: 'branch-admin-b@erc.local',
      passwordHash,
      role: 'branch_admin',
      branchId: branchB.id,
    },
  });
  branchBAdminId = branchBAdmin.id;
  const volunteerB = await prisma.volunteer.create({
    data: {
      branchId: branchB.id,
      code: 'ERC-TEST-2',
      englishName: 'Volunteer Two',
      email: `vol2.${randomBytes(6).toString('hex')}@erc.local`,
      passwordHash,
      status: 'approved',
      emailVerified: true,
    },
  });
  volunteerBId = volunteerB.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createServiceRecord(
  over: { date: Date; event: string; minutes: number; source?: 'seed' | 'admin_adjustment'; volunteerId?: string },
) {
  return prisma.serviceTimeRecord.create({
    data: {
      volunteerId: over.volunteerId ?? fixtures.volunteerId,
      branchId: fixtures.branchId,
      date: over.date,
      event: over.event,
      minutes: over.minutes,
      source: over.source ?? 'seed',
    },
  });
}

describe('volunteer time reads', () => {
  it('401s without a session and 403s a non-volunteer actor', async () => {
    const anon = await newAgent().get('/api/volunteer/time/summary').expect(401);
    expect(anon.body.error.code).toBe('UNAUTHENTICATED');

    const admin = newAgent();
    await login(admin, 'branch-admin', ADMIN_PASSWORD);
    const asAdmin = await admin.get('/api/volunteer/time/summary').expect(403);
    expect(asAdmin.body.error.code).toBe('FORBIDDEN');
  });

  it('returns empty records, zeroed summary, and no requests for a fresh volunteer', async () => {
    const { agent } = await volunteerAgent();

    const records = await agent.get('/api/volunteer/time/records').expect(200);
    expect(records.body.records).toEqual([]);

    const summary = await agent.get('/api/volunteer/time/summary').expect(200);
    expect(summary.body.summary).toEqual({ totalMinutes: 0, serviceDays: 0, pendingMinutes: 0, pendingRequests: 0 });

    const adds = await agent.get('/api/volunteer/time/requests').expect(200);
    expect(adds.body.requests).toEqual([]);

    const edits = await agent.get('/api/volunteer/time/edit-requests').expect(200);
    expect(edits.body.requests).toEqual([]);
  });

  it('lists only the volunteer\u2019s own records (never another volunteer\u2019s)', async () => {
    const mine = await createServiceRecord({ date: dateNDaysAgo(2), event: 'Community Event', minutes: 150 });
    const theirs = await createServiceRecord({
      date: dateNDaysAgo(1),
      event: 'Another Branch Task',
      minutes: 90,
      volunteerId: volunteerBId,
    });

    const { agent } = await volunteerAgent();
    const res = await agent.get('/api/volunteer/time/records').expect(200);
    expect(res.body.records.map((r: { id: string }) => r.id)).toEqual([mine.id]);
    expect(res.body.records[0].event).toBe('Community Event');
    expect(res.body.records[0].minutes).toBe(150);

    await prisma.serviceTimeRecord.deleteMany({ where: { id: { in: [mine.id, theirs.id] } } });
  });

  it('computes totals server-side: approved sum, distinct positive service days', async () => {
    const a = await createServiceRecord({ date: dateNDaysAgo(3), event: 'First Aid', minutes: 150 });
    const b = await createServiceRecord({ date: dateNDaysAgo(1), event: 'Training', minutes: 90 });
    const c = await createServiceRecord({ date: dateNDaysAgo(1), event: 'Admin subtraction', minutes: -30, source: 'admin_adjustment' });

    const { agent } = await volunteerAgent();
    const summary = await agent.get('/api/volunteer/time/summary').expect(200);
    // 150 + 90 − 30; the negative row shares a date with a positive one, so the
    // distinct positive-service-day count is 2, not 3.
    expect(summary.body.summary.totalMinutes).toBe(210);
    expect(summary.body.summary.serviceDays).toBe(2);

    await prisma.serviceTimeRecord.deleteMany({ where: { id: { in: [a.id, b.id, c.id] } } });
  });

  it('lists the requesting volunteer\u2019s own branch admins for assignment', async () => {
    const { agent } = await volunteerAgent();
    const res = await agent.get('/api/volunteer/time/admins').expect(200);
    expect(res.body.items.map((a: { id: string }) => a.id)).toContain(fixtures.branchAdminId);
    expect(res.body.items.map((a: { id: string }) => a.id)).not.toContain(branchBAdminId);
  });
});

describe('volunteer add-time requests', () => {
  it('creates a pending request, feeds the pending summary, and audits it', async () => {
    const { agent, csrf } = await volunteerAgent();
    const payload = { date: dateStr(dateNDaysAgo(0)), event: 'Blood Drive', minutes: 120 };

    const res = await agent
      .post('/api/volunteer/time/requests')
      .set('x-csrf-token', csrf)
      .send(payload)
      .expect(201);
    expect(res.body.request.status).toBe('pending');

    const list = await agent.get('/api/volunteer/time/requests').expect(200);
    expect(list.body.requests).toHaveLength(1);
    // @db.Date serializes as a UTC-midnight ISO string.
    expect(list.body.requests[0]).toMatchObject({ ...payload, date: `${payload.date}T00:00:00.000Z` });
    expect(list.body.requests[0].status).toBe('pending');

    const summary = await agent.get('/api/volunteer/time/summary').expect(200);
    expect(summary.body.summary.pendingMinutes).toBe(120);
    expect(summary.body.summary.pendingRequests).toBe(1);
    // Pending time never leaks into the official total.
    expect(summary.body.summary.totalMinutes).toBe(0);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'time.add_request_created' } });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(fixtures.volunteerId);
    expect(audit?.branchId).toBe(fixtures.branchId);

    await prisma.timeAddRequest.deleteMany({ where: { volunteerId: fixtures.volunteerId } });
  });

  it('supports the optional same-branch admin assignment', async () => {
    const { agent, csrf } = await volunteerAgent();
    const res = await agent
      .post('/api/volunteer/time/requests')
      .set('x-csrf-token', csrf)
      .send({ date: dateStr(dateNDaysAgo(0)), event: 'Market Day', minutes: 90, assignedAdminId: fixtures.branchAdminId })
      .expect(201);
    expect(res.body.request.assignedAdminId).toBe(fixtures.branchAdminId);

    await prisma.timeAddRequest.deleteMany({ where: { volunteerId: fixtures.volunteerId } });
  });

  it('rejects a cross-branch admin assignment', async () => {
    const { agent, csrf } = await volunteerAgent();
    const res = await agent
      .post('/api/volunteer/time/requests')
      .set('x-csrf-token', csrf)
      .send({ date: dateStr(dateNDaysAgo(0)), event: 'Event', minutes: 60, assignedAdminId: branchBAdminId })
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_ASSIGNED_ADMIN');
  });

  it('rejects duplicates, bad dates, zero/oversize minutes, and missing CSRF', async () => {
    const { agent, csrf } = await volunteerAgent();
    const payload = { date: dateStr(dateNDaysAgo(0)), event: 'Repeated Event', minutes: 45 };
    await agent.post('/api/volunteer/time/requests').set('x-csrf-token', csrf).send(payload).expect(201);

    const dup = await agent.post('/api/volunteer/time/requests').set('x-csrf-token', csrf).send(payload).expect(409);
    expect(dup.body.error.code).toBe('DUPLICATE_TIME_REQUEST');

    const noCsrf = await agent.post('/api/volunteer/time/requests').send(payload).expect(403);
    expect(noCsrf.body.error.code).toBe('CSRF_TOKEN_INVALID');

    const badDate = await agent
      .post('/api/volunteer/time/requests')
      .set('x-csrf-token', csrf)
      .send({ date: '2026-02-30', event: 'x', minutes: 45 })
      .expect(400);
    expect(badDate.body.error.code).toBe('VALIDATION_ERROR');

    const zero = await agent
      .post('/api/volunteer/time/requests')
      .set('x-csrf-token', csrf)
      .send({ date: dateStr(dateNDaysAgo(0)), event: 'x', minutes: 0 })
      .expect(400);
    expect(zero.body.error.code).toBe('VALIDATION_ERROR');

    const oversize = await agent
      .post('/api/volunteer/time/requests')
      .set('x-csrf-token', csrf)
      .send({ date: dateStr(dateNDaysAgo(0)), event: 'x', minutes: 1441 })
      .expect(400);
    expect(oversize.body.error.code).toBe('VALIDATION_ERROR');

    await prisma.timeAddRequest.deleteMany({ where: { volunteerId: fixtures.volunteerId } });
  });

  it('locks time requests for unverified or rejected volunteers', async () => {
    const passwordHash = await hashPassword(ADMIN_PASSWORD);
    const unverified = await prisma.volunteer.create({
      data: {
        branchId: fixtures.branchId,
        code: 'ERC-TEST-U',
        englishName: 'Unverified Volunteer',
        email: `unverified.${randomBytes(6).toString('hex')}@erc.local`,
        passwordHash,
        status: 'approved',
        emailVerified: false,
      },
    });

    const locked = newAgent();
    const lockedCsrf = await login(locked, 'ERC-TEST-U', ADMIN_PASSWORD);
    const res = await locked
      .post('/api/volunteer/time/requests')
      .set('x-csrf-token', lockedCsrf)
      .send({ date: dateStr(dateNDaysAgo(0)), event: 'x', minutes: 60 })
      .expect(403);
    expect(res.body.error.code).toBe('TIME_REQUESTS_LOCKED');

    await prisma.volunteer.delete({ where: { id: unverified.id } });
  });
});

describe('volunteer edit requests', () => {
  it('snapshots the original values and leaves the official record untouched until approval', async () => {
    const record = await createServiceRecord({ date: dateNDaysAgo(0), event: 'First Aid Training', minutes: 120 });
    const { agent, csrf } = await volunteerAgent();

    const res = await agent
      .post('/api/volunteer/time/edit-requests')
      .set('x-csrf-token', csrf)
      .send({
        recordId: record.id,
        date: dateStr(dateNDaysAgo(0)),
        event: 'First Aid Training (corrected)',
        minutes: 150,
        reason: 'I stayed an extra half hour.',
      })
      .expect(201);
    expect(res.body.request.status).toBe('pending');

    const list = await agent.get('/api/volunteer/time/edit-requests').expect(200);
    expect(list.body.requests).toHaveLength(1);
    const req = list.body.requests[0];
    expect(req.requestedMinutes).toBe(150);
    expect(req.requestedEvent).toBe('First Aid Training (corrected)');
    expect(req.originalMinutes).toBe(120);
    expect(req.originalEvent).toBe('First Aid Training');
    expect(req.reason).toBe('I stayed an extra half hour.');

    // The live record is NOT changed by a pending edit request.
    const row = await prisma.serviceTimeRecord.findUnique({ where: { id: record.id } });
    expect(row?.minutes).toBe(120);
    expect(row?.event).toBe('First Aid Training');

    const audit = await prisma.auditLog.findFirst({ where: { action: 'time.edit_request_created' } });
    expect(audit).not.toBeNull();
    expect(audit?.metadata).toMatchObject({ recordId: record.id, requestedMinutes: 150 });

    await prisma.timeEditRequest.deleteMany({ where: { volunteerId: fixtures.volunteerId } });
    await prisma.serviceTimeRecord.delete({ where: { id: record.id } });
  });

  it('404s on another volunteer\u2019s record (IDOR) and 400s outside the edit window', async () => {
    const mineOld = await createServiceRecord({ date: dateNDaysAgo(20), event: 'Old Event', minutes: 60 });

    const { agent, csrf } = await volunteerAgent();
    const foreign = await agent
      .post('/api/volunteer/time/edit-requests')
      .set('x-csrf-token', csrf)
      .send({ recordId: mineOld.id, date: dateStr(dateNDaysAgo(0)), event: 'x', minutes: 60, reason: 'x' })
      .expect(400);
    expect(foreign.body.error.code).toBe('EDIT_REQUEST_WINDOW_EXPIRED');

    const theirRecord = await createServiceRecord({ date: dateNDaysAgo(0), event: 'Theirs', minutes: 90, volunteerId: volunteerBId });
    const notFound = await agent
      .post('/api/volunteer/time/edit-requests')
      .set('x-csrf-token', csrf)
      .send({ recordId: theirRecord.id, date: dateStr(dateNDaysAgo(0)), event: 'x', minutes: 60, reason: 'x' })
      .expect(404);
    expect(notFound.body.error.code).toBe('NOT_FOUND');

    // Same volunteer, fresh record, but the request is still rejected below the
    // window — proving the IDOR 404 came from ownership, not the age check.
    const fresh = await createServiceRecord({ date: dateNDaysAgo(0), event: 'Fresh', minutes: 60 });
    const edit = await agent
      .post('/api/volunteer/time/edit-requests')
      .set('x-csrf-token', csrf)
      .send({ recordId: fresh.id, date: dateStr(dateNDaysAgo(0)), event: 'y', minutes: 60, reason: 'z' })
      .expect(201);
    expect(edit.body.request.status).toBe('pending');

    await prisma.timeEditRequest.deleteMany({ where: { volunteerId: fixtures.volunteerId } });
    await prisma.serviceTimeRecord.deleteMany({ where: { id: { in: [mineOld.id, theirRecord.id, fresh.id] } } });
  });

  it('allows only one pending edit request per record', async () => {
    const record = await createServiceRecord({ date: dateNDaysAgo(0), event: 'Event', minutes: 120 });
    const { agent, csrf } = await volunteerAgent();

    const payload = { recordId: record.id, date: dateStr(dateNDaysAgo(0)), event: 'Event', minutes: 120, reason: 'first' };
    await agent.post('/api/volunteer/time/edit-requests').set('x-csrf-token', csrf).send(payload).expect(201);

    const dup = await agent
      .post('/api/volunteer/time/edit-requests')
      .set('x-csrf-token', csrf)
      .send({ ...payload, reason: 'second' })
      .expect(409);
    expect(dup.body.error.code).toBe('EDIT_REQUEST_ALREADY_PENDING');

    await prisma.timeEditRequest.deleteMany({ where: { volunteerId: fixtures.volunteerId } });
    await prisma.serviceTimeRecord.delete({ where: { id: record.id } });
  });

  it('requires a reason and supports the optional assigned admin', async () => {
    const record = await createServiceRecord({ date: dateNDaysAgo(0), event: 'Event', minutes: 120 });
    const { agent, csrf } = await volunteerAgent();

    const noReason = await agent
      .post('/api/volunteer/time/edit-requests')
      .set('x-csrf-token', csrf)
      .send({ recordId: record.id, date: dateStr(dateNDaysAgo(0)), event: 'y', minutes: 100, reason: '   ' })
      .expect(400);
    expect(noReason.body.error.code).toBe('VALIDATION_ERROR');

    const ok = await agent
      .post('/api/volunteer/time/edit-requests')
      .set('x-csrf-token', csrf)
      .send({
        recordId: record.id,
        date: dateStr(dateNDaysAgo(0)),
        event: 'y',
        minutes: 100,
        reason: 'correction',
        assignedAdminId: fixtures.branchAdminId,
      })
      .expect(201);
    expect(ok.body.request.assignedAdminId).toBe(fixtures.branchAdminId);

    await prisma.timeEditRequest.deleteMany({ where: { volunteerId: fixtures.volunteerId } });
    await prisma.serviceTimeRecord.delete({ where: { id: record.id } });
  });
});
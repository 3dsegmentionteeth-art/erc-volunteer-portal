import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request, { SuperAgentTest } from 'supertest';
import { buildApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/password';
import { ADMIN_PASSWORD, seedAuthFixtures } from './helpers';

type Agent = SuperAgentTest;

const app = buildApp();
const dateStr = (d: Date) => d.toISOString().slice(0, 10);

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

async function adminAgent(username: string): Promise<{ agent: Agent; csrf: string }> {
  const agent = newAgent();
  const csrf = await login(agent, username, ADMIN_PASSWORD);
  return { agent, csrf };
}

function dateNDaysAgo(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function makePendingAdd(volunteerId: string, branchId: string, over: Partial<{ minutes: number }> = {}) {
  return prisma.timeAddRequest.create({
    data: {
      volunteerId,
      branchId,
      date: dateNDaysAgo(0),
      event: `Event ${randomBytes(4).toString('hex')}`,
      minutes: over.minutes ?? 90,
      status: 'pending',
    },
  });
}

async function makeVolunteer(branchId: string, code: string): Promise<string> {
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const volunteer = await prisma.volunteer.create({
    data: {
      branchId,
      code,
      englishName: `V ${code}`,
      email: `${code.toLowerCase()}.${randomBytes(6).toString('hex')}@erc.local`,
      passwordHash,
      status: 'approved',
      emailVerified: true,
      organization: 'Demo Org',
      idNumber: '29909120000000',
    },
  });
  return volunteer.id;
}

// Attaches an id_document the way production does: a registration owned by the
// volunteer, restored via volunteer.registration_id. `status` is the document
// review state the test wants to simulate.
async function attachIdDocument(
  volunteerId: string,
  branchId: string,
  status: 'pending' | 'approved' | 'rejected',
) {
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const registration = await prisma.registration.create({
    data: {
      branchId,
      englishName: 'Reg for identity test',
      email: `reg.${randomBytes(6).toString('hex')}@erc.local`,
      phone: '+201000000000',
      passwordHash,
      status: 'approved',
      volunteerId,
    },
  });
  await prisma.volunteer.update({ where: { id: volunteerId }, data: { registrationId: registration.id } });
  return prisma.document.create({
    data: {
      registrationId: registration.id,
      branchId,
      objectKey: `registrations/${registration.id}/${randomBytes(6).toString('hex')}`,
      originalName: 'id.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1024,
      category: 'id_document',
      status,
    },
  });
}

describe('admin time management (Phase 5)', () => {
  let fixtures: Awaited<ReturnType<typeof seedAuthFixtures>> & { branchBId?: string; adminBId?: string };
  let volunteerAId: string;
  let volunteerBId: string;

  beforeAll(async () => {
    fixtures = await seedAuthFixtures();
    const passwordHash = await hashPassword(ADMIN_PASSWORD);
    const branchB = await prisma.branch.create({
      data: { code: 'ERC-B2', nameEn: 'Branch Two', nameAr: 'الفرع الثاني' },
    });
    const adminB = await prisma.admin.create({
      data: {
        username: 'branch-admin-b',
        fullNameEn: 'Branch Admin B',
        email: 'branch-admin-b@erc.local',
        passwordHash,
        role: 'branch_admin',
        branchId: branchB.id,
      },
    });
    fixtures.branchBId = branchB.id;
    fixtures.adminBId = adminB.id;
    volunteerAId = await makeVolunteer(fixtures.branchId, 'ERC-TEST-A');
    volunteerBId = await makeVolunteer(branchB.id, 'ERC-TEST-B');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function cleanup() {
    await prisma.adminTimeAdjustment.deleteMany();
    await prisma.timeEditRequest.deleteMany();
    await prisma.timeAddRequest.deleteMany();
    await prisma.serviceTimeRecord.deleteMany();
  }

  it('401s anonymous callers and 403s volunteers on the admin routes', async () => {
    const anon = await newAgent().get('/api/admin/time/overview').expect(401);
    expect(anon.body.error.code).toBe('UNAUTHENTICATED');

    const volunteer = newAgent();
    await login(volunteer, 'ERC-TEST-1', ADMIN_PASSWORD);
    const asVolunteer = await volunteer.get('/api/admin/time/overview').expect(403);
    expect(asVolunteer.body.error.code).toBe('FORBIDDEN');
  });

  it('scopes the overview by branch: HQ sees everything, branch admin sees only their own', async () => {
    await makePendingAdd(volunteerAId, fixtures.branchId, { minutes: 120 });
    await makePendingAdd(volunteerBId, fixtures.branchBId!, { minutes: 45 });

    const { agent: branchAgent } = await adminAgent('branch-admin');
    const scoped = await branchAgent.get('/api/admin/time/overview').expect(200);
    expect(scoped.body.overview.pendingAddRequests).toBe(1);
    expect(scoped.body.overview.pendingVolunteerMinutes).toBe(120);

    const { agent: hqAgent } = await adminAgent('admin');
    const unscoped = await hqAgent.get('/api/admin/time/overview').expect(200);
    expect(unscoped.body.overview.pendingAddRequests).toBe(2);
    expect(unscoped.body.overview.pendingVolunteerMinutes).toBe(165);

    await cleanup();
  });

  it('approving an add request creates the official record, audits it, and refuses a second decision', async () => {
    const req = await makePendingAdd(volunteerAId, fixtures.branchId);
    const { agent, csrf } = await adminAgent('branch-admin');

    const res = await agent
      .post(`/api/admin/time/add-requests/${req.id}/decide`)
      .set('x-csrf-token', csrf)
      .send({ action: 'approve' })
      .expect(200);
    expect(res.body.request.status).toBe('approved');
    expect(res.body.request.recordId).toBeTruthy();

    const record = await prisma.serviceTimeRecord.findUnique({ where: { id: res.body.request.recordId } });
    expect(record).toMatchObject({ minutes: 90, source: 'add_request', volunteerId: volunteerAId, branchId: fixtures.branchId });

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'time.add_request.approved', targetType: 'timeAddRequest', targetId: req.id },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(fixtures.branchAdminId);
    expect(audit?.metadata).toMatchObject({ minutes: 90 });

    // No double approval: the second decision (from anyone) conflicts.
    const again = await agent
      .post(`/api/admin/time/add-requests/${req.id}/decide`)
      .set('x-csrf-token', csrf)
      .send({ action: 'approve' })
      .expect(409);
    expect(again.body.error.code).toBe('TIME_REQUEST_ALREADY_DECIDED');

    await cleanup();
  });

  it('rejecting an add request never creates a record and leaves the totals untouched', async () => {
    const req = await makePendingAdd(volunteerAId, fixtures.branchId, { minutes: 300 });
    const { agent, csrf } = await adminAgent('branch-admin');

    const res = await agent
      .post(`/api/admin/time/add-requests/${req.id}/decide`)
      .set('x-csrf-token', csrf)
      .send({ action: 'reject' })
      .expect(200);
    expect(res.body.request.status).toBe('rejected');

    const summary = await agent.get('/api/admin/time/overview').expect(200);
    expect(summary.body.overview.pendingAddRequests).toBe(0);
    expect(summary.body.overview.approvedMinutes).toBe(0);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'time.add_request.rejected', targetId: req.id } });
    expect(audit).not.toBeNull();

    await cleanup();
  });

  it('blocks a branch admin from deciding another branch\u2019s request (fail closed)', async () => {
    const reqInB = await makePendingAdd(volunteerBId, fixtures.branchBId!);
    const { agent, csrf } = await adminAgent('branch-admin');

    const res = await agent
      .post(`/api/admin/time/add-requests/${reqInB.id}/decide`)
      .set('x-csrf-token', csrf)
      .send({ action: 'approve' })
      .expect(403);
    expect(res.body.error.code).toBe('BRANCH_SCOPE_VIOLATION');

    // And the list endpoint hides it too.
    const list = await agent.get('/api/admin/time/add-requests').expect(200);
    expect(list.body.requests.map((r: { id: string }) => r.id)).not.toContain(reqInB.id);

    await cleanup();
  });

  it('HQ approves cross-branch requests', async () => {
    const reqInB = await makePendingAdd(volunteerBId, fixtures.branchBId!);
    const { agent, csrf } = await adminAgent('admin');

    const res = await agent
      .post(`/api/admin/time/add-requests/${reqInB.id}/decide`)
      .set('x-csrf-token', csrf)
      .send({ action: 'approve' })
      .expect(200);
    expect(res.body.request.status).toBe('approved');

    await cleanup();
  });

  it('approving an edit request applies the requested values to the live record', async () => {
    const record = await prisma.serviceTimeRecord.create({
      data: {
        volunteerId: volunteerAId,
        branchId: fixtures.branchId,
        date: dateNDaysAgo(0),
        event: 'Original Event',
        minutes: 60,
        source: 'admin_adjustment',
        reason: 'seed for edit flow',
      },
    });
    const edit = await prisma.timeEditRequest.create({
      data: {
        volunteerId: volunteerAId,
        recordId: record.id,
        branchId: fixtures.branchId,
        requestedDate: dateNDaysAgo(0),
        requestedEvent: 'Corrected Event',
        requestedMinutes: 75,
        reason: 'I stayed longer.',
        originalDate: dateNDaysAgo(0),
        originalEvent: 'Original Event',
        originalMinutes: 60,
        status: 'pending',
      },
    });

    const { agent, csrf } = await adminAgent('branch-admin');
    const res = await agent
      .post(`/api/admin/time/edit-requests/${edit.id}/decide`)
      .set('x-csrf-token', csrf)
      .send({ action: 'approve' })
      .expect(200);
    expect(res.body.request.status).toBe('approved');
    expect(res.body.request.record).toMatchObject({ event: 'Corrected Event', minutes: 75 });

    const row = await prisma.serviceTimeRecord.findUnique({ where: { id: record.id } });
    expect(row?.minutes).toBe(75);
    expect(row?.event).toBe('Corrected Event');

    const snapshot = await prisma.timeEditRequest.findUnique({ where: { id: edit.id } });
    expect(snapshot?.originalMinutes).toBe(60); // history preserved

    const audit = await prisma.auditLog.findFirst({ where: { action: 'time.edit_request.approved', targetId: edit.id } });
    expect(audit?.metadata).toMatchObject({ old: { minutes: 60 }, new: { minutes: 75 } });

    await cleanup();
  });

  it('rejects an edit request without touching the record', async () => {
    const record = await prisma.serviceTimeRecord.create({
      data: {
        volunteerId: volunteerAId,
        branchId: fixtures.branchId,
        date: dateNDaysAgo(0),
        event: 'Keep Me',
        minutes: 30,
        source: 'seed',
      },
    });
    const edit = await prisma.timeEditRequest.create({
      data: {
        volunteerId: volunteerAId,
        recordId: record.id,
        branchId: fixtures.branchId,
        requestedDate: dateNDaysAgo(0),
        requestedEvent: 'Nope',
        requestedMinutes: 999,
        reason: 'wrong',
        originalDate: dateNDaysAgo(0),
        originalEvent: 'Keep Me',
        originalMinutes: 30,
        status: 'pending',
      },
    });

    const { agent, csrf } = await adminAgent('branch-admin');
    await agent
      .post(`/api/admin/time/edit-requests/${edit.id}/decide`)
      .set('x-csrf-token', csrf)
      .send({ action: 'reject' })
      .expect(200);

    const row = await prisma.serviceTimeRecord.findUnique({ where: { id: record.id } });
    expect(row?.minutes).toBe(30);

    await cleanup();
  });

  it('creates signed adjustments with a mandatory reason and audits the ledger', async () => {
    const { agent, csrf } = await adminAgent('branch-admin');

    const add = await agent
      .post('/api/admin/time/adjustments')
      .set('x-csrf-token', csrf)
      .send({ volunteerId: volunteerAId, date: dateStr(dateNDaysAgo(1)), event: 'Overtime Correction', minutes: 30, reason: 'Recorded shift was 30 short.' })
      .expect(200);

    await agent
      .post('/api/admin/time/adjustments')
      .set('x-csrf-token', csrf)
      .send({ volunteerId: volunteerAId, date: dateStr(dateNDaysAgo(1)), event: 'Mistake Reversal', minutes: -30, reason: 'Matched the wrong volunteer.' })
      .expect(200);

    const records = await prisma.serviceTimeRecord.findMany({
      where: { volunteerId: volunteerAId, source: 'admin_adjustment' },
    });
    expect(records.map((r) => r.minutes).sort((a, b) => a - b)).toEqual([-30, 30]);

    const ledger = await prisma.adminTimeAdjustment.count({ where: { adminId: fixtures.branchAdminId } });
    expect(ledger).toBe(2);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'time.adjustment.created', targetId: add.body.record.id } });
    expect(audit?.metadata).toMatchObject({ deltaMinutes: 30, reason: 'Recorded shift was 30 short.' });

    // Enforced: nonzero, |minutes| <= 1440, reason required, valid volunteer.
    const zero = await agent
      .post('/api/admin/time/adjustments')
      .set('x-csrf-token', csrf)
      .send({ volunteerId: volunteerAId, date: dateStr(dateNDaysAgo(0)), event: 'x', minutes: 0, reason: 'x' })
      .expect(400);
    expect(zero.body.error.code).toBe('VALIDATION_ERROR');

    const oversized = await agent
      .post('/api/admin/time/adjustments')
      .set('x-csrf-token', csrf)
      .send({ volunteerId: volunteerAId, date: dateStr(dateNDaysAgo(0)), event: 'x', minutes: 1441, reason: 'x' })
      .expect(400);
    expect(oversized.body.error.code).toBe('VALIDATION_ERROR');

    const noReason = await agent
      .post('/api/admin/time/adjustments')
      .set('x-csrf-token', csrf)
      .send({ volunteerId: volunteerAId, date: dateStr(dateNDaysAgo(0)), event: 'x', minutes: 30, reason: '   ' })
      .expect(400);
    expect(noReason.body.error.code).toBe('VALIDATION_ERROR');

    const unknownVolunteer = await agent
      .post('/api/admin/time/adjustments')
      .set('x-csrf-token', csrf)
      .send({ volunteerId: 'does-not-exist', date: dateStr(dateNDaysAgo(0)), event: 'x', minutes: 30, reason: 'x' })
      .expect(404);
    expect(unknownVolunteer.body.error.code).toBe('NOT_FOUND');

    await cleanup();
  });

  it('verifies volunteer identity idempotently, document-backed, and only within the admin\u2019s branch', async () => {
    // The verdict must rest on a real review: an approved id_document is
    // required (production path: uploaded against the registration).
    await attachIdDocument(volunteerAId, fixtures.branchId, 'approved');

    const { agent, csrf } = await adminAgent('branch-admin');
    const res = await agent
      .post(`/api/admin/time/volunteers/${volunteerAId}/identity-verify`)
      .set('x-csrf-token', csrf)
      .send({})
      .expect(200);
    expect(res.body.identityVerified).toBe(true);

    const once = await agent
      .post(`/api/admin/time/volunteers/${volunteerAId}/identity-verify`)
      .set('x-csrf-token', csrf)
      .send({})
      .expect(200);
    expect(once.body.identityVerified).toBe(true);

    const audits = await prisma.auditLog.count({ where: { action: 'volunteer.identity_verified', targetId: volunteerAId } });
    expect(audits).toBeGreaterThanOrEqual(2);

    const scoped = await agent
      .post(`/api/admin/time/volunteers/${volunteerBId}/identity-verify`)
      .set('x-csrf-token', csrf)
      .send({})
      .expect(403);
    expect(scoped.body.error.code).toBe('BRANCH_SCOPE_VIOLATION');

    // audit_logs is append-only; test cleanup restores the volunteer column
    // only (the appended rows are wiped by the next resetDb truncate).
    await prisma.volunteer.update({ where: { id: volunteerAId }, data: { identityVerified: false } });
  });

  it('refuses identity verification without an approved id_document', async () => {
    const { agent, csrf } = await adminAgent('branch-admin');
    const volunteerCId = await makeVolunteer(fixtures.branchId, 'ERC-TEST-C');

    // 1. No document at all → 409.
    const none = await agent
      .post(`/api/admin/time/volunteers/${volunteerCId}/identity-verify`)
      .set('x-csrf-token', csrf)
      .send({})
      .expect(409);
    expect(none.body.error.code).toBe('ID_DOCUMENT_NOT_APPROVED');
    expect(await prisma.volunteer.findUnique({ where: { id: volunteerCId } })).toMatchObject({ identityVerified: false });

    // 2. A pending id_document is not enough → 409.
    const doc = await attachIdDocument(volunteerCId, fixtures.branchId, 'pending');
    const pending = await agent
      .post(`/api/admin/time/volunteers/${volunteerCId}/identity-verify`)
      .set('x-csrf-token', csrf)
      .send({})
      .expect(409);
    expect(pending.body.error.code).toBe('ID_DOCUMENT_NOT_APPROVED');

    // 3. A rejected id_document is not enough → 409.
    await prisma.document.update({ where: { id: doc.id }, data: { status: 'rejected' } });
    const rejected = await agent
      .post(`/api/admin/time/volunteers/${volunteerCId}/identity-verify`)
      .set('x-csrf-token', csrf)
      .send({})
      .expect(409);
    expect(rejected.body.error.code).toBe('ID_DOCUMENT_NOT_APPROVED');

    // 4. Approving that same document unlocks the verdict.
    await prisma.document.update({ where: { id: doc.id }, data: { status: 'approved' } });
    const ok = await agent
      .post(`/api/admin/time/volunteers/${volunteerCId}/identity-verify`)
      .set('x-csrf-token', csrf)
      .send({})
      .expect(200);
    expect(ok.body.identityVerified).toBe(true);
  });

  it('lists volunteers with server-computed completion and branch-scoped records', async () => {
    const { agent } = await adminAgent('branch-admin');

    const volunteers = await agent.get('/api/admin/time/volunteers').expect(200);
    const codes = volunteers.body.volunteers.map((v: { code: string }) => v.code);
    expect(codes).toContain('ERC-TEST-A');
    expect(codes).not.toContain('ERC-TEST-B'); // other branch hidden
    const incomplete = volunteers.body.volunteers.find((v: { code: string }) => v.code === 'ERC-TEST-A');
    expect(incomplete.profileCompletion).toBeLessThan(100);

    const records = await agent.get(`/api/admin/time/volunteers/${volunteerAId}/records`).expect(200);
    expect(records.body.volunteer.code).toBe('ERC-TEST-A');
    expect(records.body.records).toEqual([]);

    const foreign = await agent.get(`/api/admin/time/volunteers/${volunteerBId}/records`).expect(403);
    expect(foreign.body.error.code).toBe('BRANCH_SCOPE_VIOLATION');
  });
});
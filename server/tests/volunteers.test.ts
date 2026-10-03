import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request, { SuperAgentTest } from 'supertest';
import { buildApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/password';
import { ADMIN_PASSWORD, seedAuthFixtures } from './helpers';

type Agent = SuperAgentTest;

const app = buildApp();
let fixtures: Awaited<ReturnType<typeof seedAuthFixtures>>;
let branchBId: string;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

async function fetchCsrf(agent: Agent): Promise<string> {
  const res = await agent.get('/api/auth/csrf-token').expect(200);
  return res.body.csrfToken as string;
}

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

function applicant(over: Record<string, unknown> = {}, branchId: string = fixtures.branchId) {
  return {
    branchId,
    englishName: 'New Volunteer',
    arabicName: 'متطوع جديد',
    email: `applicant.${randomBytes(6).toString('hex')}@erc.local`,
    phone: '+201000000000',
    password: 'volunteer-pass-123',
    organization: 'Teba Hospital',
    idNumber: '29909123456788',
    ...over,
  };
}

async function registerAgent(agent: Agent, over: Record<string, unknown> = {}) {
  const csrf = await fetchCsrf(agent);
  return agent.post('/api/volunteer/register').set('x-csrf-token', csrf).send(applicant(over));
}

async function mkRegistration(
  over: Record<string, unknown> = {},
  branchId: string = fixtures.branchId,
): Promise<string> {
  const res = await registerAgent(newAgent(), { ...over, branchId });
  expect(res.status).toBe(201);
  return res.body.registration.id as string;
}

async function mkVerifiedVolunteer(email: string, code: string): Promise<string> {
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const volunteer = await prisma.volunteer.create({
    data: {
      branchId: fixtures.branchId,
      code,
      englishName: 'Verify Subject',
      email,
      passwordHash,
      status: 'approved',
      organization: 'Teba Hospital',
    },
  });
  return volunteer.id;
}

async function mkRawToken(volunteerId: string, raw: string, expiresAt?: Date): Promise<void> {
  await prisma.emailVerification.create({
    data: { volunteerId, tokenHash: sha256(raw), expiresAt: expiresAt ?? new Date(Date.now() + 3_600_000) },
  });
}

beforeAll(async () => {
  fixtures = await seedAuthFixtures();
  const branchB = await prisma.branch.create({
    data: { code: 'ERC-B2', nameEn: 'Branch Two', nameAr: 'الفرع الثاني' },
  });
  branchBId = branchB.id;
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  await prisma.admin.create({
    data: {
      username: 'branch-admin-b',
      fullNameEn: 'Branch Admin B',
      email: 'branch-admin-b@erc.local',
      passwordHash,
      role: 'branch_admin',
      branchId: branchB.id,
    },
  });
  });

afterAll(async () => {
  await prisma.$disconnect();
});

describe('public registration', () => {
  it('creates a pending registration and an audit entry; never leaks the hash', async () => {
    const res = await registerAgent(newAgent());
    expect(res.status).toBe(201);
    expect(res.body.registration.status).toBe('pending');
    expect(res.body.registration.email).toBeTruthy();
    expect(res.body.registration).not.toHaveProperty('passwordHash');
    expect(res.body.registration).not.toHaveProperty('password_hash');

    const row = await prisma.registration.findUnique({ where: { id: res.body.registration.id } });
    expect(row?.status).toBe('pending');
    expect(row?.passwordHash).toBeTruthy();
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'registration.created', targetId: res.body.registration.id },
    });
    expect(audit).not.toBeNull();
    expect(audit?.branchId).toBe(fixtures.branchId);
  });

  it('requires a csrf token on this mutating route (403 without)', async () => {
    const res = await request(app).post('/api/volunteer/register').send(applicant());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_TOKEN_INVALID');
  });

  it('rejects invalid input with VALIDATION_ERROR', async () => {
    const agent = newAgent();
    const bad = [
      { email: 'not-an-email' },
      { password: 'short' },
      { branchId: '' },
      { phone: 'x' },
      { englishName: 'A' },
    ];
    for (const over of bad) {
      const res = await registerAgent(agent, over);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('conflicts with an existing volunteer email and a pending registration email', async () => {
    const takenByVolunteer = await registerAgent(newAgent(), { email: 'volunteer1@erc.local' });
    expect(takenByVolunteer.status).toBe(409);
    expect(takenByVolunteer.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');

    const first = applicant();
    const ok = await registerAgent(newAgent(), first);
    expect(ok.status).toBe(201);
    const again = await registerAgent(newAgent(), first);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('rejects an unknown or inactive branch', async () => {
    const unknown = await registerAgent(newAgent(), { branchId: 'does-not-exist' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('INVALID_BRANCH');

    const inactive = await prisma.branch.create({
      data: { code: 'ERC-OFF', nameEn: 'Inactive', nameAr: 'مغلق', isActive: false },
    });
    const off = await registerAgent(newAgent(), { branchId: inactive.id });
    expect(off.status).toBe(400);
    expect(off.body.error.code).toBe('BRANCH_INACTIVE');
  });
});

describe('admin review queue', () => {
  it('requires an admin session (401 anonymous, 403 volunteer)', async () => {
    const anonymous = await request(app).get('/api/admin/registrations').expect(401);
    expect(anonymous.body.error.code).toBe('UNAUTHENTICATED');

    const volunteerAgent = newAgent();
    await login(volunteerAgent, 'ERC-TEST-1', ADMIN_PASSWORD);
    const asVolunteer = await volunteerAgent.get('/api/admin/registrations').expect(403);
    expect(asVolunteer.body.error.code).toBe('FORBIDDEN');
  });

  it('lists with pagination meta and finds results by search, scoped to the admin branch', async () => {
    const agent = newAgent();
    const csrf = await login(agent, 'branch-admin', ADMIN_PASSWORD);

    const inA = applicant({ englishName: 'Pagination Unique Name' });
    const inB = applicant({ englishName: 'Branch B Only Applicant', branchId: branchBId }, branchBId);
    const made = await registerAgent(newAgent(), inA);
    expect(made.status).toBe(201);
    const madeB = await registerAgent(newAgent(), inB);
    expect(madeB.status).toBe(201);

    // Branch admin of branch A sees only branch A registrations.
    const listA = await agent
      .get('/api/admin/registrations?pageSize=100')
      .set('x-csrf-token', csrf)
      .expect(200);
    const emailsA = listA.body.items.map((r: { email: string }) => r.email);
    expect(emailsA).toContain(inA.email);
    expect(emailsA).not.toContain(inB.email);
    expect(listA.body.meta).toHaveProperty('page');
    expect(listA.body.meta.total).toBeGreaterThanOrEqual(1);

    // Search matches by email substring across the scoped set.
    const search = await agent
      .get('/api/admin/registrations')
      .query({ q: `${inA.email.split('@')[0]}` })
      .set('x-csrf-token', csrf)
      .expect(200);
    expect(search.body.items.some((r: { email: string }) => r.email === inA.email)).toBe(true);

    // Pagination slices.
    const page1 = await agent
      .get('/api/admin/registrations?page=1&pageSize=2')
      .set('x-csrf-token', csrf)
      .expect(200);
    expect(page1.body.items.length).toBeLessThanOrEqual(2);
  });

  it('scopes branch admins: B admin never sees A registrations; detail is 404 for unknown', async () => {
    const hq = newAgent();
    await login(hq, 'admin', ADMIN_PASSWORD);
    const inA = await mkRegistration({ englishName: 'Scope Target X' });

    const adminB = newAgent();
    await login(adminB, 'branch-admin-b', ADMIN_PASSWORD);

    const detailA = await adminB.get(`/api/admin/registrations/${inA}`).expect(403);
    expect(detailA.body.error.code).toBe('BRANCH_SCOPE_VIOLATION');

    const hqDetail = await hq.get(`/api/admin/registrations/${inA}`).expect(200);
    expect(hqDetail.body.registration.branch.nameEn).toBe('Headquarters');

    const miss = await hq.get('/api/admin/registrations/nope-not-real').expect(404);
    expect(miss.body.error.code).toBe('NOT_FOUND');
  });
});

describe('approve / reject', () => {
  it('approves transactionally: volunteer created, code allocated, audit + verification issued; login works', async () => {
    const hq = newAgent();
    const csrf = await login(hq, 'admin', ADMIN_PASSWORD);
    const regId = await mkRegistration({ email: 'approve.me@erc.local', password: 'volunteer-pass-123' });

    const res = await hq
      .post(`/api/admin/registrations/${regId}/approve`)
      .set('x-csrf-token', csrf)
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.code).toBe('ERC-1001'); // first numeric ERC code (seeded code is ERC-TEST-1)

    const volunteer = await prisma.volunteer.findUnique({ where: { registrationId: regId } });
    expect(volunteer).not.toBeNull();
    expect(volunteer?.status).toBe('approved');
    expect(volunteer?.emailVerified).toBe(false);

    const reg = await prisma.registration.findUnique({ where: { id: regId } });
    expect(reg?.status).toBe('approved');
    expect(reg?.decidedBy).toBe(fixtures.hqAdminId);
    expect(reg?.volunteerId).toBe(volunteer?.id);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'registration.approved', targetId: regId } });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(fixtures.hqAdminId);

    const verif = await prisma.emailVerification.findFirst({ where: { volunteerId: volunteer?.id } });
    expect(verif).not.toBeNull();
    expect(verif?.usedAt).toBeNull();

    // End-to-end: the freshly-created volunteer can sign in with their code.
    // (Explicit GET-first: supertest's agent cookie jar can miss the csrf
    // cookie when `await fetchCsrf()` is inlined into `.set(...)`, giving a
    // determined CSRF_TOKEN_INVALID. Product flow verified separately.)
    const vAgent = newAgent();
    const csrfToken = await fetchCsrf(vAgent);
    const loginRes = await vAgent
      .post('/api/auth/login')
      .set('x-csrf-token', csrfToken)
      .send({ identifier: res.body.code, password: 'volunteer-pass-123' })
      .expect(200);
    expect(loginRes.body.user.role).toBe('volunteer');
    expect(loginRes.body.user.isHq).toBe(false);
  });

  it('double-approval is a no-op 409', async () => {
    const hq = newAgent();
    const csrf = await login(hq, 'admin', ADMIN_PASSWORD);
    const regId = await mkRegistration();
    await hq.post(`/api/admin/registrations/${regId}/approve`).set('x-csrf-token', csrf).expect(200);
    const again = await hq.post(`/api/admin/registrations/${regId}/approve`).set('x-csrf-token', csrf).expect(409);
    expect(again.body.error.code).toBe('REGISTRATION_ALREADY_DECIDED');
  });

  it('rejects with audit; rejecting an approved one is 409', async () => {
    const hq = newAgent();
    const csrf = await login(hq, 'admin', ADMIN_PASSWORD);
    const regId = await mkRegistration();
    const res = await hq.post(`/api/admin/registrations/${regId}/reject`).set('x-csrf-token', csrf).expect(200);
    expect(res.body.registration.status).toBe('rejected');

    const audit = await prisma.auditLog.findFirst({ where: { action: 'registration.rejected', targetId: regId } });
    expect(audit).not.toBeNull();

    const approvedId = await mkRegistration();
    await hq.post(`/api/admin/registrations/${approvedId}/approve`).set('x-csrf-token', csrf).expect(200);
    const again = await hq.post(`/api/admin/registrations/${approvedId}/reject`).set('x-csrf-token', csrf).expect(409);
    expect(again.body.error.code).toBe('REGISTRATION_ALREADY_DECIDED');
  });

  it('branch admins can approve their own branch but are rejected cross-branch with 403', async () => {
    const adminB = newAgent();
    const csrfB = await login(adminB, 'branch-admin-b', ADMIN_PASSWORD);

    const ownRegId = await mkRegistration({}, branchBId);
    const own = await adminB
      .post(`/api/admin/registrations/${ownRegId}/approve`)
      .set('x-csrf-token', csrfB)
      .expect(200);
    expect(own.body.ok).toBe(true);

    const otherRegId = await mkRegistration({});
    const foreign = await adminB
      .post(`/api/admin/registrations/${otherRegId}/approve`)
      .set('x-csrf-token', csrfB)
      .expect(403);
    expect(foreign.body.error.code).toBe('BRANCH_SCOPE_VIOLATION');
  });

  it('volunteers cannot approve; unknown registration is 404', async () => {
    const vAgent = newAgent();
    const csrfV = await login(vAgent, 'ERC-TEST-1', ADMIN_PASSWORD);
    const regId = await mkRegistration();
    const asVolunteer = await vAgent
      .post(`/api/admin/registrations/${regId}/approve`)
      .set('x-csrf-token', csrfV)
      .expect(403);
    expect(asVolunteer.body.error.code).toBe('FORBIDDEN');

    const hq = newAgent();
    const csrf = await login(hq, 'admin', ADMIN_PASSWORD);
    const miss = await hq
      .post('/api/admin/registrations/not-a-real-id/approve')
      .set('x-csrf-token', csrf)
      .expect(404);
    expect(miss.body.error.code).toBe('NOT_FOUND');
  });
});

describe('email verification', () => {
  it('verifies with a valid single-use token and audits the event', async () => {
    const volunteerId = await mkVerifiedVolunteer('verify.ok@erc.local', 'ERC-VOK-1');
    const raw = randomBytes(16).toString('hex');
    await mkRawToken(volunteerId, raw);

    const agent = newAgent();
    const csrf = await fetchCsrf(agent);
    const res = await agent
      .post('/api/volunteer/verify-email')
      .set('x-csrf-token', csrf)
      .send({ token: raw })
      .expect(200);
    expect(res.body.ok).toBe(true);

    const volunteer = await prisma.volunteer.findUnique({ where: { id: volunteerId } });
    expect(volunteer?.emailVerified).toBe(true);
    const tokenRow = await prisma.emailVerification.findFirst({ where: { volunteerId } });
    expect(tokenRow?.usedAt).not.toBeNull();
    const audit = await prisma.auditLog.findFirst({ where: { action: 'auth.email_verified', targetId: volunteerId } });
    expect(audit).not.toBeNull();
  });

  it('rejects an unknown token, a replayed (consumed) token, and an expired one', async () => {
    const volunteerId = await mkVerifiedVolunteer('verify.bad@erc.local', 'ERC-VBAD-1');
    const raw = randomBytes(16).toString('hex');
    await mkRawToken(volunteerId, raw);

    const agent = newAgent();
    const csrf = await fetchCsrf(agent);
    const garbage = await agent
      .post('/api/volunteer/verify-email')
      .set('x-csrf-token', csrf)
      .send({ token: randomBytes(16).toString('hex') })
      .expect(400);
    expect(garbage.body.error.code).toBe('INVALID_VERIFICATION_TOKEN');

    await agent
      .post('/api/volunteer/verify-email')
      .set('x-csrf-token', csrf)
      .send({ token: raw })
      .expect(200);
    const replay = await agent
      .post('/api/volunteer/verify-email')
      .set('x-csrf-token', csrf)
      .send({ token: raw })
      .expect(400);
    expect(replay.body.error.code).toBe('INVALID_VERIFICATION_TOKEN');

    const expiredId = await mkVerifiedVolunteer('verify.expired@erc.local', 'ERC-VEXP-1');
    const rawExp = randomBytes(16).toString('hex');
    await mkRawToken(expiredId, rawExp, new Date(Date.now() - 1000));
    const expired = await agent
      .post('/api/volunteer/verify-email')
      .set('x-csrf-token', csrf)
      .send({ token: rawExp })
      .expect(400);
    expect(expired.body.error.code).toBe('INVALID_VERIFICATION_TOKEN');
  });

  it('resend burns outstanding tokens and requires an authenticated volunteer', async () => {
    const volunteer = await prisma.volunteer.findUnique({ where: { code: 'ERC-TEST-1' } });
    expect(volunteer).not.toBeNull();
    const oldRaw = randomBytes(16).toString('hex');
    await mkRawToken(volunteer!.id, oldRaw);

    const agent = newAgent();
    const csrf = await login(agent, 'ERC-TEST-1', ADMIN_PASSWORD);
    const res = await agent
      .post('/api/volunteer/resend-verification')
      .set('x-csrf-token', csrf)
      .expect(200);
    expect(res.body.ok).toBe(true);

    // The previous token is burned; exactly one active token remains.
    const oldStillValid = await agent
      .post('/api/volunteer/verify-email')
      .set('x-csrf-token', csrf)
      .send({ token: oldRaw })
      .expect(400);
    expect(oldStillValid.body.error.code).toBe('INVALID_VERIFICATION_TOKEN');
    const active = await prisma.emailVerification.findMany({ where: { volunteerId: volunteer!.id, usedAt: null } });
    expect(active.length).toBe(1);

    const anonymous = newAgent();
    const anonCsrf = await fetchCsrf(anonymous);
    const anon = await anonymous
      .post('/api/volunteer/resend-verification')
      .set('x-csrf-token', anonCsrf)
      .expect(401);
    expect(anon.body.error.code).toBe('UNAUTHENTICATED');
  });
});
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request, { SuperAgentTest } from 'supertest';
import { buildApp } from '../src/app';
import { config } from '../src/config';
import { lastCapturedMail } from '../src/lib/mailer';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/password';
import { objectExists } from '../src/lib/storage';
import { ADMIN_PASSWORD, seedAuthFixtures } from './helpers';

type Agent = SuperAgentTest;

const app = buildApp();
let fixtures: Awaited<ReturnType<typeof seedAuthFixtures>>;

const PDF = Buffer.from('%PDF-1.4\n-fake pdf payload-', 'utf8');

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

// Registers, then pulls the application-access token out of the email the
// register endpoint sends (captured by the stream transport in tests).
async function mkRegistration(
  branchId: string = fixtures.branchId,
): Promise<{ registrationId: string; token: string }> {
  const agent = newAgent();
  const csrf = await fetchCsrf(agent);
  const res = await agent
    .post('/api/volunteer/register')
    .set('x-csrf-token', csrf)
    .send({
      branchId,
      englishName: 'Document Applicant',
      arabicName: 'مقدم طلب',
      email: `doc.${randomBytes(6).toString('hex')}@erc.local`,
      phone: '+201000000001',
      password: 'volunteer-pass-123',
      organization: 'Teba Hospital',
    })
    .expect(201);

  const mail = lastCapturedMail();
  expect(mail).toBeDefined();
  expect(mail!.type).toBe('application-access');
  expect(mail!.url).toMatch(/\/application\/[^/]+\/documents\?token=/);
  const match = mail!.url.match(/token=([0-9a-f]+)/);
  expect(match).not.toBeNull();
  return { registrationId: res.body.registration.id as string, token: match![1] };
}

interface UploadOver {
  token?: string;
  category?: string;
  file?: { buffer: Buffer; name?: string; type?: string };
}

function uploadDoc(agent: Agent, registrationId: string, over: UploadOver = {}) {
  const req = agent
    .post(`/api/registrations/${registrationId}/documents`)
    .field('category', over.category ?? 'id_document')
    .field('applicationAccessToken', over.token ?? '');
  const file = over.file;
  if (file) {
    req.attach('file', file.buffer, {
      filename: file.name ?? 'passport.pdf',
      contentType: file.type ?? 'application/pdf',
    });
  }
  return req;
}

beforeAll(async () => {
  fixtures = await seedAuthFixtures();
  const branchB = await prisma.branch.create({
    data: { code: 'ERC-B2', nameEn: 'Branch Two', nameAr: 'الفرع الثاني' },
  });
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

describe('registration document upload (applicant)', () => {
  it('stores a pending document row + object and audits; never leaks the object key', async () => {
    const { registrationId: regId, token } = await mkRegistration();
    const agent = newAgent();
    const csrf = await fetchCsrf(agent);

    const res = await uploadDoc(agent, regId, { token, file: { buffer: PDF, name: 'passport.pdf', type: 'application/pdf' } })
      .set('x-csrf-token', csrf)
      .expect(201);
    const { document } = res.body;
    expect(document.status).toBe('pending');
    expect(document.registrationId).toBe(regId);
    expect(document.originalName).toBe('passport.pdf');
    expect(document.contentType).toBe('application/pdf');
    expect(document.sizeBytes).toBe(PDF.length);
    expect(document).not.toHaveProperty('objectKey');

    const row = await prisma.document.findUnique({ where: { id: document.id } });
    expect(row).not.toBeNull();
    expect(row?.branchId).toBe(fixtures.branchId);
    expect(row?.category).toBe('id_document');
    expect(await objectExists(row!.objectKey)).toBe(true);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'document.uploaded', targetId: document.id } });
    expect(audit).not.toBeNull();
    expect(audit?.branchId).toBe(fixtures.branchId);
  });

  it('blocks without CSRF, with a bad category or MIME, an oversize file, and no file at all', async () => {
    const { registrationId: regId, token } = await mkRegistration();

    const noCsrf = await uploadDoc(newAgent(), regId, { token, file: { buffer: PDF } }).expect(403);
    expect(noCsrf.body.error.code).toBe('CSRF_TOKEN_INVALID');

    const agent = newAgent();
    const csrf = await fetchCsrf(agent);

    const badCategory = await uploadDoc(agent, regId, { token, category: 'warrant', file: { buffer: PDF } })
      .set('x-csrf-token', csrf)
      .expect(400);
    expect(badCategory.body.error.code).toBe('VALIDATION_ERROR');

    const badMime = await uploadDoc(agent, regId, { token, file: { buffer: Buffer.from('hello'), name: 'notes.txt', type: 'text/plain' } })
      .set('x-csrf-token', csrf)
      .expect(400);
    expect(badMime.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');

    const oversize = await uploadDoc(agent, regId, {
      token,
      file: { buffer: Buffer.alloc(config.documents.maxBytes + 1), name: 'big.bin', type: 'application/pdf' },
    })
      .set('x-csrf-token', csrf)
      .expect(413);
    expect(oversize.body.error.code).toBe('FILE_TOO_LARGE');

    const missing = await uploadDoc(agent, regId, { token })
      .set('x-csrf-token', csrf)
      .expect(400);
    expect(missing.body.error.code).toBe('FILE_REQUIRED');
  });

  it('404s on an unknown registration and 409s once the registration is decided', async () => {
    const agent = newAgent();
    const csrf = await fetchCsrf(agent);

    const miss = await uploadDoc(agent, 'no-such-registration', { token: 'f'.repeat(64), file: { buffer: PDF } })
      .set('x-csrf-token', csrf)
      .expect(404);
    expect(miss.body.error.code).toBe('NOT_FOUND');

    const { registrationId: regId, token } = await mkRegistration();
    const decisionAgent = newAgent();
    const dCsrf = await fetchCsrf(decisionAgent);
    await uploadDoc(decisionAgent, regId, { token, file: { buffer: PDF } })
      .set('x-csrf-token', dCsrf)
      .expect(201);

    const hq = newAgent();
    const hqCsrf = await login(hq, 'admin', ADMIN_PASSWORD);
    await hq.post(`/api/admin/registrations/${regId}/approve`).set('x-csrf-token', hqCsrf).expect(200);

    const decidedAgent = newAgent();
    const decidedCsrf = await fetchCsrf(decidedAgent);
    const decided = await uploadDoc(decidedAgent, regId, { token, file: { buffer: PDF } })
      .set('x-csrf-token', decidedCsrf)
      .expect(409);
    expect(decided.body.error.code).toBe('REGISTRATION_DECIDED');
  });

  it('lets the applicant delete their own pending document and removes the object', async () => {
    const { registrationId: regId, token } = await mkRegistration();
    const agent = newAgent();
    const csrf = await fetchCsrf(agent);
    const res = await uploadDoc(agent, regId, { token, file: { buffer: PDF } })
      .set('x-csrf-token', csrf)
      .expect(201);
    const docId = res.body.document.id as string;
    const row = await prisma.document.findUniqueOrThrow({ where: { id: docId } });

    const del = await agent
      .delete(`/api/registrations/${regId}/documents/${docId}`)
      .set('x-csrf-token', csrf)
      .send({ applicationAccessToken: token })
      .expect(200);
    expect(del.body.ok).toBe(true);

    expect(await prisma.document.findUnique({ where: { id: docId } })).toBeNull();
    expect(await objectExists(row.objectKey)).toBe(false);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'document.deleted', targetId: docId } });
    expect(audit).not.toBeNull();
  });
});

describe('application-access token gating (public document path)', () => {
  it('rejects missing, forged, and cross-registration tokens with distinct 403 codes', async () => {
    const { registrationId: regId, token } = await mkRegistration();
    const agent = newAgent();
    const csrf = await fetchCsrf(agent);

    const missing = await uploadDoc(agent, regId, { file: { buffer: PDF } })
      .set('x-csrf-token', csrf)
      .expect(403);
    expect(missing.body.error.code).toBe('APPLICATION_ACCESS_TOKEN_MISSING');

    const forged = await uploadDoc(agent, regId, { token: 'f'.repeat(64), file: { buffer: PDF } })
      .set('x-csrf-token', csrf)
      .expect(403);
    expect(forged.body.error.code).toBe('APPLICATION_ACCESS_TOKEN_INVALID');

    const other = await mkRegistration();
    const crossed = await uploadDoc(agent, regId, { token: other.token, file: { buffer: PDF } })
      .set('x-csrf-token', csrf)
      .expect(403);
    expect(crossed.body.error.code).toBe('APPLICATION_ACCESS_TOKEN_INVALID');

    const ok = await uploadDoc(agent, regId, { token, file: { buffer: PDF } })
      .set('x-csrf-token', csrf)
      .expect(201);
    expect(ok.body.document.status).toBe('pending');
  });

  it('rejects an expired token on upload and on delete (ADMIN expires it)', async () => {
    const { registrationId: regId, token } = await mkRegistration();
    const agent = newAgent();
    const csrf = await fetchCsrf(agent);
    const uploaded = await uploadDoc(agent, regId, { token, file: { buffer: PDF } })
      .set('x-csrf-token', csrf)
      .expect(201);
    const docId = uploaded.body.document.id as string;

    await prisma.applicationAccessToken.updateMany({
      where: { registrationId: regId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const expired = await uploadDoc(agent, regId, { token, category: 'certificate', file: { buffer: PDF } })
      .set('x-csrf-token', csrf)
      .expect(403);
    expect(expired.body.error.code).toBe('APPLICATION_ACCESS_TOKEN_EXPIRED');

    const expiredDelete = await agent
      .delete(`/api/registrations/${regId}/documents/${docId}`)
      .set('x-csrf-token', csrf)
      .send({ applicationAccessToken: token })
      .expect(403);
    expect(expiredDelete.body.error.code).toBe('APPLICATION_ACCESS_TOKEN_EXPIRED');
  });

  it('burns the token at decision: reuse after approve gets 409 and usedAt is set', async () => {
    const { registrationId: regId, token } = await mkRegistration();
    const hq = newAgent();
    const csrf = await login(hq, 'admin', ADMIN_PASSWORD);
    await hq.post(`/api/admin/registrations/${regId}/approve`).set('x-csrf-token', csrf).expect(200);

    const applicant = newAgent();
    const aCsrf = await fetchCsrf(applicant);
    const reuse = await uploadDoc(applicant, regId, { token, file: { buffer: PDF } })
      .set('x-csrf-token', aCsrf)
      .expect(409);
    expect(reuse.body.error.code).toBe('REGISTRATION_DECIDED');

    const rows = await prisma.applicationAccessToken.findMany({ where: { registrationId: regId } });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((t) => t.usedAt !== null)).toBe(true);
  });
});

describe('admin document review', () => {
  it('lists documents for a registration, branch-scoped, with category filter', async () => {
    const { registrationId: regId, token } = await mkRegistration();
    const applicant = newAgent();
    const aCsrf = await fetchCsrf(applicant);
    await uploadDoc(applicant, regId, { token, category: 'photo', file: { buffer: PDF, type: 'image/png' } })
      .set('x-csrf-token', aCsrf)
      .expect(201);
    await uploadDoc(applicant, regId, { token, category: 'certificate', file: { buffer: PDF } })
      .set('x-csrf-token', aCsrf)
      .expect(201);

    const adminA = newAgent();
    const aAdminCsrf = await login(adminA, 'branch-admin', ADMIN_PASSWORD);
    const list = await adminA
      .get(`/api/admin/registrations/${regId}/documents`)
      .set('x-csrf-token', aAdminCsrf)
      .expect(200);
    expect(list.body.items).toHaveLength(2);

    const filtered = await adminA
      .get(`/api/admin/registrations/${regId}/documents?category=photo`)
      .set('x-csrf-token', aAdminCsrf)
      .expect(200);
    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0].category).toBe('photo');

    const adminB = newAgent();
    await login(adminB, 'branch-admin-b', ADMIN_PASSWORD);
    const foreign = await adminB.get(`/api/admin/registrations/${regId}/documents`).expect(403);
    expect(foreign.body.error.code).toBe('BRANCH_SCOPE_VIOLATION');
  });

  it('approves and rejects with audit, preventing double review and cross-branch access', async () => {
    const { registrationId: regId, token } = await mkRegistration();
    const applicant = newAgent();
    const aCsrf = await fetchCsrf(applicant);
    const ok = await uploadDoc(applicant, regId, { token, file: { buffer: PDF } })
      .set('x-csrf-token', aCsrf)
      .expect(201);
    const docId = ok.body.document.id as string;

    const adminB = newAgent();
    const bCsrf = await login(adminB, 'branch-admin-b', ADMIN_PASSWORD);
    const scoped = await adminB.post(`/api/admin/documents/${docId}/approve`).set('x-csrf-token', bCsrf).expect(403);
    expect(scoped.body.error.code).toBe('BRANCH_SCOPE_VIOLATION');

    const hq = newAgent();
    const csrf = await login(hq, 'admin', ADMIN_PASSWORD);
    const approved = await hq.post(`/api/admin/documents/${docId}/approve`).set('x-csrf-token', csrf).expect(200);
    expect(approved.body.document.status).toBe('approved');
    expect(approved.body.document.reviewerId).toBe(fixtures.hqAdminId);

    const again = await hq.post(`/api/admin/documents/${docId}/approve`).set('x-csrf-token', csrf).expect(409);
    expect(again.body.error.code).toBe('DOCUMENT_ALREADY_REVIEWED');

    const auditApprove = await prisma.auditLog.findFirst({ where: { action: 'document.approved', targetId: docId } });
    expect(auditApprove).not.toBeNull();
    expect(auditApprove?.actorId).toBe(fixtures.hqAdminId);

    // Reject a fresh document with a note.
    const regB = await mkRegistration();
    const applicant2 = newAgent();
    const csrf2 = await fetchCsrf(applicant2);
    const rejectable = await uploadDoc(applicant2, regB.registrationId, { token: regB.token, file: { buffer: PDF } })
      .set('x-csrf-token', csrf2)
      .expect(201);
    const rejected = await hq
      .post(`/api/admin/documents/${rejectable.body.document.id}/reject`)
      .set('x-csrf-token', csrf)
      .send({ note: 'Illegible scan.' })
      .expect(200);
    expect(rejected.body.document.status).toBe('rejected');
    expect(rejected.body.document.reviewNote).toBe('Illegible scan.');

    const rejectAgain = await hq
      .post(`/api/admin/documents/${rejectable.body.document.id}/reject`)
      .set('x-csrf-token', csrf)
      .send({ note: 'again' })
      .expect(409);
    expect(rejectAgain.body.error.code).toBe('DOCUMENT_ALREADY_REVIEWED');

    const auditReject = await prisma.auditLog.findFirst({
      where: { action: 'document.rejected', targetId: rejectable.body.document.id },
    });
    expect(auditReject).not.toBeNull();
  });

  it('issues a working pre-signed download URL for an approved document', async () => {
    const { registrationId: regId, token } = await mkRegistration();
    const applicant = newAgent();
    const aCsrf = await fetchCsrf(applicant);
    const payload = Buffer.from('%PDF-1.4 signed bytes');
    const res = await uploadDoc(applicant, regId, { token, file: { buffer: payload, name: 'signed.pdf' } })
      .set('x-csrf-token', aCsrf)
      .expect(201);
    const docId = res.body.document.id as string;

    const hq = newAgent();
    const csrf = await login(hq, 'admin', ADMIN_PASSWORD);
    await hq.post(`/api/admin/documents/${docId}/approve`).set('x-csrf-token', csrf).expect(200);

    const urlRes = await hq.get(`/api/admin/documents/${docId}/download-url`).set('x-csrf-token', csrf).expect(200);
    expect(urlRes.body).toHaveProperty('url');
    expect(urlRes.body.expiresInSeconds).toBe(config.documents.presignedTtlSeconds);

    const fetched = await fetch(urlRes.body.url as string);
    expect(fetched.status).toBe(200);
    expect(Buffer.from(await fetched.arrayBuffer()).toString()).toBe(payload.toString());
  });
});

describe('email verification delivery', () => {
  it('emits the verification email with the one-time link on approval, and the token verifies', async () => {
    const hq = newAgent();
    const csrf = await login(hq, 'admin', ADMIN_PASSWORD);
    const { registrationId: regId } = await mkRegistration();
    await hq.post(`/api/admin/registrations/${regId}/approve`).set('x-csrf-token', csrf).expect(200);

    const mail = lastCapturedMail();
    expect(mail).toBeDefined();
    expect(mail!.to).toMatch(/@erc\.local$/);
    expect(mail!.subject).toContain('Verify your email');
    expect(mail!.type).toBe('email-verification');
    expect(mail!.url).toMatch(`/${config.publicHost.split('://')[1]}/verify-email?token=`);

    const match = mail!.url.match(/token=([0-9a-f]+)/);
    expect(match).not.toBeNull();
    const token = match![1];

    const verifyAgent = newAgent();
    const vCsrf = await fetchCsrf(verifyAgent);
    const verify = await verifyAgent
      .post('/api/volunteer/verify-email')
      .set('x-csrf-token', vCsrf)
      .send({ token })
      .expect(200);
    expect(verify.body.ok).toBe(true);
    expect(verify.body.email).toBe(mail!.to);
  });
});
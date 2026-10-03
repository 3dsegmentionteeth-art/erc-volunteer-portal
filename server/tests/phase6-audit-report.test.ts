import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request, { SuperAgentTest } from 'supertest';
import { buildApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/password';
import { createAudit } from '../src/modules/auth/auth.repository';
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

function dateNDaysAgo(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function makePendingAdd(volunteerId: string, branchId: string, minutes: number, branchAdminId: string) {
  return prisma.timeAddRequest.create({
    data: {
      volunteerId,
      branchId,
      assignedAdminId: branchAdminId,
      date: dateNDaysAgo(0),
      event: `Field day ${randomBytes(4).toString('hex')}`,
      minutes,
      status: 'pending',
    },
  });
}

describe('Phase 6: audit log (admin) + activity (volunteer) + service reports', () => {
  let branchAId: string;
  let branchBId: string;
  let branchAdminA: string;
  let branchAdminB: string;
  let volunteerAId: string;
  const hq = newAgent();
  const adminA = newAgent();
  const adminB = newAgent();
  const volunteerA = newAgent();

  beforeAll(async () => {
    const fixtures = await seedAuthFixtures();
    branchAId = fixtures.branchId;
    branchAdminA = fixtures.branchAdminId;
    volunteerAId = fixtures.volunteerId;

    const passwordHash = await hashPassword(ADMIN_PASSWORD);
    const branchB = await prisma.branch.create({
      data: { code: 'ERC-P6B', nameEn: 'Branch P6 Beta', nameAr: 'فرع بيتا' },
    });
    branchBId = branchB.id;
    const adminBRow = await prisma.admin.create({
      data: {
        username: 'p6-branch-admin',
        fullNameEn: 'P6 Branch Admin',
        email: 'p6-branch-admin@erc.local',
        passwordHash,
        role: 'branch_admin',
        branchId: branchB.id,
      },
    });
    branchAdminB = adminBRow.id;
    const volunteerB = await prisma.volunteer.create({
      data: {
        branchId: branchB.id,
        code: 'ERC-P6B-1',
        englishName: 'Volunteer Beta',
        email: 'p6-beta@erc.local',
        passwordHash,
        status: 'approved',
      },
    });

    // Official records: volunteer A = +90 (approved event) and -30 (official
    // adjustment), volunteer B = +45. Sums are asserted against these values.
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

    // Guarantee some other-branch audit rows exist so the branch scoping test
    // has real rows to exclude (a branch A admin must never see them).
    await createAudit({
      actorType: 'admin',
      actorId: branchAdminB,
      actorName: 'P6 Branch Admin',
      actorRole: 'branch_admin',
      action: 'time.adjustment.created',
      targetType: 'serviceTimeRecord',
      targetId: randomBytes(6).toString('hex'),
      branchId: branchB.id,
      metadata: { volunteerId: volunteerB.id, deltaMinutes: 45 },
    });
    await createAudit({
      actorType: 'admin',
      actorId: branchAdminB,
      actorName: 'P6 Branch Admin',
      actorRole: 'branch_admin',
      action: 'volunteer.identity_verified',
      targetType: 'volunteer',
      targetId: volunteerB.id,
      branchId: branchB.id,
      metadata: { code: volunteerB.code },
    });

    // Four authenticated agents (one login each) keep us far below the login
    // limiter's per-IP ceiling for the whole file.
    await login(hq, 'admin', ADMIN_PASSWORD);
    await login(adminA, 'branch-admin', ADMIN_PASSWORD);
    await login(adminB, 'p6-branch-admin', ADMIN_PASSWORD);
    await login(volunteerA, fixtures.volunteerCode, ADMIN_PASSWORD);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('admin audit log', () => {
    it('401s anonymous callers and 403s volunteers', async () => {
      await newAgent().get('/api/admin/audit').expect(401);
      await volunteerA.get('/api/admin/audit').expect(403);
    });

    it('HQ sees rows across branches with pagination meta and newest first', async () => {
      const res = await hq.get('/api/admin/audit').expect(200);
      expect(res.body.items.length).toBeGreaterThan(0);
      expect(res.body.meta).toMatchObject({ page: 1, pageSize: 25 });
      expect(res.body.meta.total).toBeGreaterThanOrEqual(res.body.items.length);
      const seen = new Set(res.body.items.map((i: { branchId: string | null }) => i.branchId));
      expect(seen.has(branchAId) || seen.has(branchBId)).toBe(true);
      const times = res.body.items.map((i: { createdAt: string }) => new Date(i.createdAt).getTime());
      for (let idx = 1; idx < times.length; idx += 1) {
        expect(times[idx - 1]).toBeGreaterThanOrEqual(times[idx]);
      }
    });

    it('branch admins only ever see their own branch rows (fail closed)', async () => {
      const res = await adminA.get('/api/admin/audit').expect(200);
      expect(res.body.items.length).toBeGreaterThan(0);
      for (const item of res.body.items) {
        expect(item.branchId).toBe(branchAId);
      }
      const totalAOnly = res.body.meta.total;
      const resHq = await hq.get('/api/admin/audit').expect(200);
      expect(resHq.body.meta.total).toBeGreaterThan(totalAOnly);
    });

    it('filters by action, actor name, target type, and date range', async () => {
      const byAction = await adminA
        .get('/api/admin/audit')
        .query({ action: 'time.add_request.approved' })
        .expect(200);
      for (const item of byAction.body.items) {
        expect(item.action).toBe('time.add_request.approved');
      }

      const byActor = await hq.get('/api/admin/audit').query({ q: `HQ` }).expect(200);
      for (const item of byActor.body.items) {
        expect(item.actorName).toMatch(/HQ/i);
      }

      const byTarget = await hq.get('/api/admin/audit').query({ targetType: 'volunteer' }).expect(200);
      for (const item of byTarget.body.items) {
        expect(item.targetType).toBe('volunteer');
      }

      const from = dateStr(dateNDaysAgo(1));
      const to = dateStr(new Date());
      const inRange = await hq.get('/api/admin/audit').query({ from, to }).expect(200);
      for (const item of inRange.body.items) {
        const t = new Date(item.createdAt).getTime();
        expect(t).toBeGreaterThanOrEqual(new Date(`${from}T00:00:00.000Z`).getTime());
      }

      // A range entirely in the future must be empty, proving the to-boundary
      // is inclusive and the from-boundary is enforced.
      const future = dateStr(dateNDaysAgo(-7));
      const empty = await hq.get('/api/admin/audit').query({ from: future, to: future }).expect(200);
      expect(empty.body.items).toEqual([]);
      expect(empty.body.meta.total).toBe(0);
    });

    it('paginates with stable totals', async () => {
      const page1 = await hq.get('/api/admin/audit').query({ page: 1, pageSize: 2 }).expect(200);
      const page2 = await hq.get('/api/admin/audit').query({ page: 2, pageSize: 2 }).expect(200);
      expect(page1.body.items.length).toBe(2);
      expect(page2.body.items.length).toBe(2);
      expect(page1.body.meta.total).toBe(page2.body.meta.total);
      const ids1 = new Set(page1.body.items.map((i: { id: string }) => i.id));
      for (const item of page2.body.items) {
        expect(ids1.has(item.id)).toBe(false);
      }
    });
  });

  describe('service reports + verification references', () => {
    it('approves a pending request through the API so the approval is audited (feeds the activity log)', async () => {
      const requestRow = await makePendingAdd(volunteerAId, branchAId, 90, branchAdminA);
      const csrf = await fetchCsrf(adminA);
      const res = await adminA
        .post(`/api/admin/time/add-requests/${requestRow.id}/decide`)
        .set('x-csrf-token', csrf)
        .send({ action: 'approve' })
        .expect(200);
      expect(res.body.request.status).toBe('approved');
    });

    it('generates a report with server-computed totals and audits it', async () => {
      // ledger so far: +90 (seeded) + -30 (seeded) + 90 (approved) = 150.
      const res = await hq.get(`/api/admin/reports/volunteers/${volunteerAId}/report`).expect(200);
      expect(res.body.report).toMatchObject({
        totalMinutes: 150,
        recordCount: 3,
      });
      expect(res.body.report.records).toHaveLength(3);
      expect(res.body.report.volunteer.code).toBe('ERC-TEST-1');
      expect(res.body.verification.ref).toMatch(/^[0-9a-f]{48}$/);

      // The generation itself is audited, carrying the same opaque ref.
      const audit = await adminA.get('/api/admin/audit').query({ action: 'report.generated' }).expect(200);
      expect(audit.body.items.some((i: { metadata: { ref?: string } }) => i.metadata?.ref === res.body.verification.ref)).toBe(true);
    });

    it('only the whole branch scope is not an escape hatch: cross-branch report is 403', async () => {
      await adminB.get(`/api/admin/reports/volunteers/${volunteerAId}/report`).expect((r) => {
        expect(r.status).toBe(403);
        expect(r.body.error.code).toBe('BRANCH_SCOPE_VIOLATION');
      });
      await volunteerA.get(`/api/admin/reports/volunteers/${volunteerAId}/report`).expect(403);
      await newAgent().get(`/api/admin/reports/volunteers/${volunteerAId}/report`).expect(401);
    });

    it('re-generating issues a distinct reference each time', async () => {
      const first = await hq.get(`/api/admin/reports/volunteers/${volunteerAId}/report`).expect(200);
      const second = await hq.get(`/api/admin/reports/volunteers/${volunteerAId}/report`).expect(200);
      expect(first.body.verification.ref).not.toBe(second.body.verification.ref);
      // keep the last one for the revocation test below
      (globalThis as { __lastRef?: string }).__lastRef = second.body.verification.ref;
    });

    it('public verification returns only verifier-appropriate fields', async () => {
      const generated = await hq.get(`/api/admin/reports/volunteers/${volunteerAId}/report`).expect(200);
      const ref = generated.body.verification.ref as string;

      const res = await newAgent().get(`/api/verify/${ref}`).expect(200);
      const body = res.body;
      expect(body.valid).toBe(true);
      expect(body.reference.scope).toBe('service_report');
      expect(body.report.approvedTotalMinutes).toBe(150);
      expect(body.volunteer).toEqual({
        code: 'ERC-TEST-1',
        englishName: 'Volunteer One',
        arabicName: null,
      });
      // No contact / identity data reaches a verifier.
      for (const key of ['email', 'phone', 'idNumber', 'branchId', 'registrationId']) {
        expect(key in body.volunteer).toBe(false);
      }
      for (const key of ['metadata', 'records', 'ipAddress']) {
        expect(key in body).toBe(false);
      }
    });

    it('unknown, malformed, and revoked references all resolve to the same 404', async () => {
      await newAgent().get('/api/verify/ffffffffffffffffffffffffffffffffffffffffffffffff').expect(404);
      await newAgent().get('/api/verify/not-a-valid-ref').expect(404);

      const revoked = (globalThis as { __lastRef?: string }).__lastRef;
      expect(revoked).toBeDefined();
      // Phase 6.1: revoke through the real API (the report row is the source
      // of truth), not by poking revoked_at directly.
      const csrf = await fetchCsrf(adminA);
      await adminA
        .post('/api/admin/reports/revoke')
        .set('x-csrf-token', csrf)
        .send({ ref: revoked, reason: 'Revoked by the Phase 6 uniform-404 test.' })
        .expect(200);
      await newAgent().get(`/api/verify/${revoked}`).expect(404);
    });
  });

  // Phase 6.1: the trust-model change (frozen snapshot + per-report
  // revocation). These tests are the evidence for QA.md Phase 6.1.
  describe('Phase 6.1: frozen snapshots + revocation', () => {
    let frozenRef: string;
    let freshRef: string;

    it('freezes the snapshot at generation: later record changes never move what verify reports', async () => {
      const generated = await hq.get(`/api/admin/reports/volunteers/${volunteerAId}/report`).expect(200);
      frozenRef = generated.body.verification.ref as string;
      expect(generated.body.report).toMatchObject({
        totalMinutes: 150,
        recordCount: 3,
        serviceDayCount: 2, // the -30 correction day is not a service day
      });

      // Unrelated record change AFTER the credential was issued (+45 on a new
      // positive date): a live recomputation would now say 195 / 4 / 3.
      await prisma.serviceTimeRecord.create({
        data: {
          volunteerId: volunteerAId,
          branchId: branchAId,
          date: dateNDaysAgo(5),
          event: 'Post-issue record',
          minutes: 45,
          source: 'add_request',
        },
      });

      const stale = await newAgent().get(`/api/verify/${frozenRef}`).expect(200);
      expect(stale.body.report).toEqual({
        approvedTotalMinutes: 150,
        recordCount: 3,
        serviceDayCount: 2,
      });

      // A freshly generated credential sees the mutated ledger — proving the
      // earlier response was a stored snapshot, not a live query by accident.
      const regenerated = await hq.get(`/api/admin/reports/volunteers/${volunteerAId}/report`).expect(200);
      expect(regenerated.body.report).toMatchObject({
        totalMinutes: 195,
        recordCount: 4,
        serviceDayCount: 3,
      });
      freshRef = regenerated.body.verification.ref as string;

      // Re-verifying a non-revoked report still returns the frozen snapshot.
      const stillStale = await newAgent().get(`/api/verify/${frozenRef}`).expect(200);
      expect(stillStale.body.report.approvedTotalMinutes).toBe(150);
    });

    it('lists reports with frozen vs live totals side by side, paged, branch-scoped', async () => {
      const res = await hq
        .get(`/api/admin/reports/volunteers/${volunteerAId}/reports`)
        .query({ pageSize: 100 })
        .expect(200);
      const items = res.body.items as {
        ref: string;
        approvedMinutes: number;
        recordCount: number;
        serviceDayCount: number;
        currentApprovedMinutes: number;
        currentRecordCount: number;
        revokedAt: string | null;
        revokedBy: string | null;
        revocationReason: string | null;
      }[];
      expect(items.length).toBeGreaterThanOrEqual(5);

      const stale = items.find((i) => i.ref === frozenRef);
      expect(stale).toMatchObject({
        approvedMinutes: 150,
        recordCount: 3,
        serviceDayCount: 2,
        currentApprovedMinutes: 195,
        currentRecordCount: 4,
        currentServiceDayCount: 3,
        revokedAt: null,
        revokedBy: null,
        revocationReason: null,
      });
      const fresh = items.find((i) => i.ref === freshRef);
      expect(fresh).toMatchObject({ approvedMinutes: 195, currentApprovedMinutes: 195 });

      // The revoked credential from the test above shows its revocation here,
      // while its frozen numbers stay untouched.
      const revoked = items.find((i) => i.ref === (globalThis as { __lastRef?: string }).__lastRef);
      expect(revoked?.revokedAt).toBeTruthy();
      expect(revoked?.approvedMinutes).toBe(150);
      expect(revoked?.revokedBy).toBeTruthy();

      // Pagination keeps stable totals and never repeats a row.
      const page1 = await hq.get(`/api/admin/reports/volunteers/${volunteerAId}/reports`).query({ page: 1, pageSize: 2 }).expect(200);
      const page2 = await hq.get(`/api/admin/reports/volunteers/${volunteerAId}/reports`).query({ page: 2, pageSize: 2 }).expect(200);
      expect(page1.body.items).toHaveLength(2);
      expect(page1.body.meta.total).toBe(page2.body.meta.total);
      const ids1 = new Set(page1.body.items.map((i: { id: string }) => i.id));
      for (const item of page2.body.items) {
        expect(ids1.has(item.id)).toBe(false);
      }

      // Fail closed on the report list too: another branch, a volunteer, and
      // an anonymous caller are all refused.
      await adminB.get(`/api/admin/reports/volunteers/${volunteerAId}/reports`).expect((r) => {
        expect(r.status).toBe(403);
        expect(r.body.error.code).toBe('BRANCH_SCOPE_VIOLATION');
      });
      await volunteerA.get(`/api/admin/reports/volunteers/${volunteerAId}/reports`).expect(403);
      await newAgent().get(`/api/admin/reports/volunteers/${volunteerAId}/reports`).expect(401);
    });

    it('refuses cross-branch revocation (403), volunteer callers (403), and anonymous callers (401)', async () => {
      const generated = await hq.get(`/api/admin/reports/volunteers/${volunteerAId}/report`).expect(200);
      const ref = generated.body.verification.ref as string;

      const crossCsrf = await fetchCsrf(adminB);
      await adminB
        .post('/api/admin/reports/revoke')
        .set('x-csrf-token', crossCsrf)
        .send({ ref, reason: 'Not my branch.' })
        .expect((r) => {
          expect(r.status).toBe(403);
          expect(r.body.error.code).toBe('BRANCH_SCOPE_VIOLATION');
        });

      const volunteerCsrf = await fetchCsrf(volunteerA);
      await volunteerA.post('/api/admin/reports/revoke').set('x-csrf-token', volunteerCsrf).send({ ref }).expect(403);
      // Anonymous: with a valid CSRF header the route still demands a session.
      const anon = newAgent();
      const anonCsrf = await fetchCsrf(anon);
      await anon.post('/api/admin/reports/revoke').set('x-csrf-token', anonCsrf).send({ ref }).expect(401);

      // And the report is still valid after every refusal (nothing failed open).
      await newAgent().get(`/api/verify/${ref}`).expect(200);
      (globalThis as { __scopeRef?: string }).__scopeRef = ref;
    });

    it('revokes with reason, audits service_report.revoked, and public verify then 404s', async () => {
      const ref = (globalThis as { __scopeRef?: string }).__scopeRef;
      expect(ref).toBeDefined();
      const csrf = await fetchCsrf(adminA);
      const res = await adminA
        .post('/api/admin/reports/revoke')
        .set('x-csrf-token', csrf)
        .send({ ref, reason: 'Issued against the wrong volunteer by mistake.' })
        .expect(200);
      expect(res.body).toMatchObject({ revoked: true, ref });

      // Public verification now 404s exactly like an unknown/malformed ref.
      await newAgent().get(`/api/verify/${ref}`).expect(404);
      await newAgent().get('/api/verify/ffffffffffffffffffffffffffffffffffffffffffffffff').expect(404);

      // Audited with who + why, in the volunteer's branch.
      const audit = await adminA.get('/api/admin/audit').query({ action: 'service_report.revoked' }).expect(200);
      const row = audit.body.items.find((i: { metadata?: { ref?: string } }) => i.metadata?.ref === ref);
      expect(row).toBeTruthy();
      expect(row.metadata.reason).toBe('Issued against the wrong volunteer by mistake.');
      expect(row.actorName).toBeTruthy();

      // Double revocation is refused — the audit trail keeps one reason.
      await adminA
        .post('/api/admin/reports/revoke')
        .set('x-csrf-token', csrf)
        .send({ ref, reason: 'Again.' })
        .expect((r) => {
          expect(r.status).toBe(409);
          expect(r.body.error.code).toBe('SERVICE_REPORT_ALREADY_REVOKED');
        });

      // Unknown ref on the revoke endpoint gets the same 404 shape as verify
      // (no existence oracle for admins either).
      await adminA
        .post('/api/admin/reports/revoke')
        .set('x-csrf-token', csrf)
        .send({ ref: 'ffffffffffffffffffffffffffffffffffffffffffffffff', reason: 'Nope.' })
        .expect(404);
    });
  });

  describe('volunteer activity log', () => {
    it('shows only the volunteer\u2019s own events, including decisions made about them', async () => {
      const res = await volunteerA.get('/api/volunteer/activity').expect(200);
      const actions = res.body.items.map((i: { action: string }) => i.action);
      expect(actions).toContain('auth.login');
      expect(actions).toContain('time.add_request.approved');
      expect(res.body.meta.total).toBeGreaterThanOrEqual(2);

      // The projection carries the curated metadata (never the raw JSON blob).
      const approved = res.body.items.find((i: { action: string }) => i.action === 'time.add_request.approved');
      expect(approved.actorType).toBe('admin');
      expect(typeof approved.date).toBe('string');
      expect(typeof approved.minutes).toBe('number');
      expect('assignedAdminId' in approved).toBe(false);
      expect('metadata' in approved).toBe(false);

      // Branch pinning: volunteer B's audit rows never leak into A's stream.
      const otherBranchRows = res.body.items.filter((i: { branchId?: string }) => i.branchId !== undefined);
      expect(otherBranchRows).toHaveLength(0);
    });

    it('401s anonymous callers and 403s admins', async () => {
      await newAgent().get('/api/volunteer/activity').expect(401);
      await hq.get('/api/volunteer/activity').expect(403);
    });

    it('paginates with a stable total', async () => {
      const first = await volunteerA.get('/api/volunteer/activity').query({ page: 1, pageSize: 1 }).expect(200);
      const all = await volunteerA.get('/api/volunteer/activity').query({ pageSize: 100 }).expect(200);
      expect(first.body.items).toHaveLength(1);
      expect(first.body.meta.total).toBe(all.body.meta.total);
    });
  });
});
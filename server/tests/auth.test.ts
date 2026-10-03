import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import cookieParser from 'cookie-parser';
import express from 'express';
import request, { SuperAgentTest } from 'supertest';
import { buildApp } from '../src/app';
import { doubleCsrfProtection } from '../src/lib/csrf';
import { prisma } from '../src/lib/prisma';
import { sessionMiddleware } from '../src/lib/session';
import { errorHandler, notFoundHandler } from '../src/middleware/error';
import { authRouter } from '../src/modules/auth/auth.routes';
import { ADMIN_PASSWORD, seedAuthFixtures } from './helpers';
import { requireBranchScope, requireOwnership, requireAdmin } from './probe-auth';

const app = buildApp();

// Probe routes exercising the authorization middleware on a real session stack.
const probeApp = express();
probeApp.use(express.json({ limit: '1mb' }));
probeApp.use(cookieParser());
probeApp.use(sessionMiddleware);
probeApp.use('/api', doubleCsrfProtection);
probeApp.use('/api/auth', authRouter);
probeApp.get('/_probe/admin-only', requireAdmin, (_req, res) => {
  res.json({ ok: true });
});
probeApp.get('/_probe/owner', requireOwnership((req) => String(req.query.ownerId ?? '')), (_req, res) => {
  res.json({ ok: true });
});
probeApp.get('/_probe/branch', requireBranchScope((req) => String(req.query.branchId ?? '')), (_req, res) => {
  res.json({ ok: true });
});
probeApp.use(notFoundHandler);
probeApp.use(errorHandler);

let fixtures: Awaited<ReturnType<typeof seedAuthFixtures>>;

async function fetchCsrf(agent: SuperAgentTest): Promise<string> {
  const res = await agent.get('/api/auth/csrf-token').expect(200);
  return res.body.csrfToken as string;
}

async function loginAs(agent: SuperAgentTest, identifier: string, password: string): Promise<string> {
  const csrf = await fetchCsrf(agent);
  const res = await agent.post('/api/auth/login').set('x-csrf-token', csrf).send({ identifier, password });
  return sidFrom(res.headers['set-cookie']);
}

async function logoutAs(agent: SuperAgentTest): Promise<void> {
  const csrf = await fetchCsrf(agent);
  await agent.post('/api/auth/logout').set('x-csrf-token', csrf).expect(200);
}

function sidFrom(setCookie: string[] | string | undefined): string | undefined {
  const list = Array.isArray(setCookie)
    ? setCookie
    : typeof setCookie === 'string'
      ? [setCookie]
      : [];
  const c = list.find((x) => x.includes('erc.sid='));
  const m = c?.match(/erc\.sid=([^;]+)/);
  return m?.[1];
}

beforeAll(async () => {
  fixtures = await seedAuthFixtures();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('health + csrf', () => {
  it('health is public (no auth, no csrf)', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body.ok).toBe(true);
  });

  it('csrf-token issues a token and an httpOnly csrf cookie', async () => {
    const agent = request.agent(app);
    const res = await agent.get('/api/auth/csrf-token').expect(200);
    expect(typeof res.body.csrfToken).toBe('string');
    const sc = res.headers['set-cookie'] as string[] | undefined;
    expect(sc?.some((x) => x.includes('erc.csrf=') && x.toLowerCase().includes('httponly'))).toBe(true);
  });

  it('mutating request without csrf token -> 403', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'admin', password: ADMIN_PASSWORD })
      .expect(403);
    expect(res.body.error.code).toBe('CSRF_TOKEN_INVALID');
  });
});

describe('admin login', () => {
  it('logs in an hq admin with a fresh csrf token', async () => {
    const agent = request.agent(app);
    const csrf = await fetchCsrf(agent);
    const res = await agent
      .post('/api/auth/login')
      .set('x-csrf-token', csrf)
      .send({ identifier: 'admin', password: ADMIN_PASSWORD })
      .expect(200);
    expect(res.body.user.role).toBe('admin');
    expect(res.body.user.isHq).toBe(true);
    expect(res.body.user.branchId).toBeNull();
    expect(typeof res.body.csrfToken).toBe('string');
    const sc = res.headers['set-cookie'] as string[] | undefined;
    expect(sc?.some((x) => x.includes('erc.sid=') && x.toLowerCase().includes('httponly'))).toBe(true);
  });

  it('rejects a wrong password with a generic 401', async () => {
    const agent = request.agent(app);
    const csrf = await fetchCsrf(agent);
    const res = await agent
      .post('/api/auth/login')
      .set('x-csrf-token', csrf)
      .send({ identifier: 'admin', password: 'definitely-wrong-pass' })
      .expect(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects an unknown identifier with the same generic 401 (no enumeration)', async () => {
    const agent = request.agent(app);
    const csrf = await fetchCsrf(agent);
    const res = await agent
      .post('/api/auth/login')
      .set('x-csrf-token', csrf)
      .send({ identifier: 'no-such-account', password: 'definitely-wrong-pass' })
      .expect(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects a malformed body with 400 VALIDATION_ERROR', async () => {
    const agent = request.agent(app);
    const csrf = await fetchCsrf(agent);
    const res = await agent
      .post('/api/auth/login')
      .set('x-csrf-token', csrf)
      .send({ identifier: 'admin', password: 'short' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('regenerates the session id on login (session-fixation mitigation)', async () => {
    const agent = request.agent(app);
    const sid1 = await loginAs(agent, 'admin', ADMIN_PASSWORD);
    const sid2 = await loginAs(agent, 'admin', ADMIN_PASSWORD);
    expect(sid1).toBeTruthy();
    expect(sid2).toBeTruthy();
    expect(sid2).not.toBe(sid1);
  });
});

describe('volunteer login', () => {
  it('logs in an approved volunteer by code', async () => {
    const agent = request.agent(app);
    const csrf = await fetchCsrf(agent);
    const res = await agent
      .post('/api/auth/login')
      .set('x-csrf-token', csrf)
      .send({ identifier: fixtures.volunteerCode, password: ADMIN_PASSWORD })
      .expect(200);
    expect(res.body.user.role).toBe('volunteer');
    expect(res.body.user.isHq).toBe(false);
    expect(res.body.user.branchId).toBe(fixtures.branchId);
  });
});

describe('/api/auth/me', () => {
  it('returns 401 when unauthenticated', async () => {
    await request(app).get('/api/auth/me').expect(401);
  });

  it('returns the authenticated user', async () => {
    const agent = request.agent(app);
    await loginAs(agent, 'admin', ADMIN_PASSWORD);
    const res = await agent.get('/api/auth/me').expect(200);
    expect(res.body.user.role).toBe('admin');
    expect(res.body.user.volunteerId).toBeUndefined();
  });
});

describe('logout + session lifecycle', () => {
  it('logout destroys the server-side session and invalidates it', async () => {
    const agent = request.agent(app);
    await loginAs(agent, 'admin', ADMIN_PASSWORD);
    await agent.get('/api/auth/me').expect(200);

    const before = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM "session"`;
    const sessionsBefore = Number(before[0]?.count ?? 0);
    expect(sessionsBefore).toBeGreaterThan(0);

    await logoutAs(agent);
    await agent.get('/api/auth/me').expect(401);

    const after = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM "session"`;
    const sessionsAfter = Number(after[0]?.count ?? 0);
    expect(sessionsAfter).toBeLessThan(sessionsBefore);
  });

  it('sessions are persisted in Postgres (not in-memory)', async () => {
    await loginAs(request.agent(app), 'branch-admin', ADMIN_PASSWORD);
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint AS count FROM "session"`;
    expect(Number(rows[0]?.count ?? 0)).toBeGreaterThan(0);
  });
});

describe('authorization middleware', () => {
  it('unauthenticated -> 401 on an admin-only route', async () => {
    await request(probeApp).get('/_probe/admin-only').expect(401);
  });

  it('volunteer calling an admin-only route -> 403', async () => {
    const agent = request.agent(probeApp);
    await loginAs(agent, fixtures.volunteerCode, ADMIN_PASSWORD);
    const res = await agent.get('/_probe/admin-only').expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('admin calling an admin-only route -> 200', async () => {
    const agent = request.agent(probeApp);
    await loginAs(agent, 'admin', ADMIN_PASSWORD);
    await agent.get('/_probe/admin-only').expect(200);
  });

  it('volunteer can only reach their own resource (own id ok, forged id -> 403)', async () => {
    const agent = request.agent(probeApp);
    await loginAs(agent, fixtures.volunteerCode, ADMIN_PASSWORD);
    await agent.get(`/_probe/owner?ownerId=${fixtures.volunteerId}`).expect(200);
    const res = await agent.get(`/_probe/owner?ownerId=${fixtures.hqAdminId}`).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('branch admin cannot reach another branch (forged branch id -> 403)', async () => {
    const agent = request.agent(probeApp);
    await loginAs(agent, 'branch-admin', ADMIN_PASSWORD);
    await agent.get(`/_probe/branch?branchId=${fixtures.branchId}`).expect(200);
    const otherBranch = await prisma.branch.create({
      data: { code: 'ERR-OTHER', nameEn: 'Other', nameAr: 'آخر' },
    });
    const res = await agent.get(`/_probe/branch?branchId=${otherBranch.id}`).expect(403);
    expect(res.body.error.code).toBe('BRANCH_SCOPE_VIOLATION');
  });

  it('hq admin bypasses branch scope', async () => {
    const agent = request.agent(probeApp);
    await loginAs(agent, 'admin', ADMIN_PASSWORD);
    const otherBranch = await prisma.branch.create({
      data: { code: 'ERR-OTHER-2', nameEn: 'Other 2', nameAr: 'آخر ٢' },
    });
    await agent.get(`/_probe/branch?branchId=${otherBranch.id}`).expect(200);
  });

  it('an expired/destroyed session cannot authenticate (401 after logout)', async () => {
    const agent = request.agent(probeApp);
    await loginAs(agent, 'branch-admin', ADMIN_PASSWORD);
    await agent.get('/_probe/admin-only').expect(200);
    await logoutAs(agent);
    await agent.get('/_probe/admin-only').expect(401);
  });
});
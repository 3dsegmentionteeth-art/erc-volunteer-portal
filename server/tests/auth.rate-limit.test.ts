// Opts into aggressive rate limiting BEFORE importing app modules, so the
// config singleton reads the low limit. `isolate: true` (vitest default) gives
// this file a fresh module graph, so the config here does not leak elsewhere.
process.env.AUTH_LOGIN_RATE_LIMIT = '4';
process.env.AUTH_LOGIN_RATE_WINDOW_MS = '60000';
process.env.AUTH_LOGIN_SLOW_DOWN_AFTER = '1000';

import { beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';

let app: express.Express;

beforeAll(async () => {
  const { buildApp } = await import('../src/app');
  app = buildApp();
});

describe('login rate limiting', () => {
  it('returns 401 for attempts within the limit, then 429 beyond it', async () => {
    const agent = request.agent(app);
    const csrfRes = await agent.get('/api/auth/csrf-token').expect(200);
    const csrf = csrfRes.body.csrfToken as string;

    for (let i = 0; i < 4; i += 1) {
      const res = await agent
        .post('/api/auth/login')
        .set('x-csrf-token', csrf)
        .send({ identifier: 'admin', password: 'wrong-password' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    }

    const blocked = await agent
      .post('/api/auth/login')
      .set('x-csrf-token', csrf)
      .send({ identifier: 'admin', password: 'wrong-password' })
      .expect(429);
    expect(blocked.body.error.code).toBe('LOGIN_RATE_LIMITED');
  });
});
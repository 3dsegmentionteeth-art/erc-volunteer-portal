// Opts into aggressive rate limiting BEFORE importing app modules so the
// config singleton picks up the low limits. `isolate: true` (vitest default)
// keeps these env values away from the other test files' module graph.
process.env.AUTH_REGISTER_RATE_LIMIT = '4';
process.env.AUTH_REGISTER_RATE_WINDOW_MS = '60000';
process.env.AUTH_VERIFY_RATE_LIMIT = '4';
process.env.AUTH_VERIFY_RATE_WINDOW_MS = '60000';

import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';

let app: express.Express;
let branchId: string;

async function fetchCsrf(agent: ReturnType<typeof request.agent>): Promise<string> {
  const res = await agent.get('/api/auth/csrf-token').expect(200);
  return res.body.csrfToken as string;
}

beforeAll(async () => {
  // Dynamic import on purpose: keeping config OUT of the statically-imported
  // graph is what lets the low limits above survive until config first loads.
  const { seedAuthFixtures } = await import('./helpers');
  const fixtures = await seedAuthFixtures();
  branchId = fixtures.branchId;
  const { buildApp } = await import('../src/app');
  app = buildApp();
});

describe('registration rate limiting', () => {
  it('allows 4 registrations then 429s with REGISTER_RATE_LIMITED', async () => {
    const agent = request.agent(app);
    const csrf = await fetchCsrf(agent);
    for (let i = 0; i < 4; i += 1) {
      const res = await agent
        .post('/api/volunteer/register')
        .set('x-csrf-token', csrf)
        .send({
          branchId,
          englishName: `Rater ${i}`,
          email: `rater.${randomBytes(4).toString('hex')}@erc.local`,
          phone: '+201000000000',
          password: 'volunteer-pass-123',
        });
      expect(res.status).toBe(201);
    }
    const blocked = await agent
      .post('/api/volunteer/register')
      .set('x-csrf-token', csrf)
      .send({
        branchId,
        englishName: 'Rater 5',
        email: `rater.${randomBytes(4).toString('hex')}@erc.local`,
        phone: '+201000000000',
        password: 'volunteer-pass-123',
      })
      .expect(429);
    expect(blocked.body.error.code).toBe('REGISTER_RATE_LIMITED');
  });

  it('429s token-verification guesses after the same limit', async () => {
    const agent = request.agent(app);
    const csrf = await fetchCsrf(agent);
    for (let i = 0; i < 4; i += 1) {
      const res = await agent
        .post('/api/volunteer/verify-email')
        .set('x-csrf-token', csrf)
        .send({ token: randomBytes(16).toString('hex') });
      expect(res.status).toBe(400); // INVALID_VERIFICATION_TOKEN, counted toward the limit
    }
    const blocked = await agent
      .post('/api/volunteer/verify-email')
      .set('x-csrf-token', csrf)
      .send({ token: randomBytes(16).toString('hex') })
      .expect(429);
    expect(blocked.body.error.code).toBe('VERIFY_RATE_LIMITED');
  });
});
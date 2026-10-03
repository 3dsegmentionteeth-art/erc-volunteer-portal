import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request, { SuperAgentTest } from 'supertest';
import { buildApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { ADMIN_PASSWORD, seedAuthFixtures } from './helpers';

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

async function volunteerAgent(): Promise<{ agent: Agent; csrf: string }> {
  const agent = newAgent();
  const csrf = await login(agent, 'ERC-TEST-1', ADMIN_PASSWORD);
  return { agent, csrf };
}

beforeAll(async () => {
  await seedAuthFixtures();
  // Partial profile: approved + email verified, but no arabic name, skills,
  // certifications, education info, application answers, id/identity. The
  // completion percentage must reflect exactly what is missing.
  await prisma.volunteer.update({
    where: { code: 'ERC-TEST-1' },
    data: {
      emailVerified: true,
      identityVerified: false,
      arabicName: null,
      skills: null,
      certifications: null,
      educationInfo: null,
      applicationAnswers: null,
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('volunteer profile (Phase 5)', () => {
  it('returns the profile without the password hash, plus a server-computed percentage', async () => {
    const { agent } = await volunteerAgent();
    const res = await agent.get('/api/volunteer/profile').expect(200);

    expect(res.body.profile).toMatchObject({
      code: 'ERC-TEST-1',
      englishName: 'Volunteer One',
      organization: 'Teba Hospital',
      idNumber: '29909123456789',
      emailVerified: true,
      identityVerified: false,
    });
    expect(res.body.profile.passwordHash).toBeUndefined();
    // 4/10: englishName, idNumber, organization, emailVerified.
    expect(res.body.completion).toEqual({
      percent: 40,
      passed: 4,
      total: 10,
      checks: expect.objectContaining({
        englishName: true,
        arabicName: false,
        skills: false,
        emailVerified: true,
        identityVerified: false,
      }),
    });
    // Never 100% while identity is not verified.
    expect(res.body.completion.percent).not.toBe(100);
  });

  it('403s a non-volunteer actor and 401s an anonymous caller', async () => {
    const anon = await newAgent().get('/api/volunteer/profile').expect(401);
    expect(anon.body.error.code).toBe('UNAUTHENTICATED');

    const admin = newAgent();
    await login(admin, 'branch-admin', ADMIN_PASSWORD);
    const asAdmin = await admin.get('/api/volunteer/profile').expect(403);
    expect(asAdmin.body.error.code).toBe('FORBIDDEN');
  });

  it('updates editable fields, recomputes completion upward, and audits the change', async () => {
    const { agent, csrf } = await volunteerAgent();
    const res = await agent
      .patch('/api/volunteer/profile')
      .set('x-csrf-token', csrf)
      .send({
        arabicName: 'متطوع واحد',
        skills: ['First Aid', 'Translation'],
        certifications: ['BLS'],
        educationInfo: 'B.Sc. Nursing, Cairo University.',
      })
      .expect(200);

    expect(res.body.profile.arabicName).toBe('متطوع واحد');
    expect(res.body.profile.skills).toEqual(['First Aid', 'Translation']);
    // 8/10: everything except applicationAnswers (not editable here; it was
    // collected at registration) and identityVerified (admin verdict).
    expect(res.body.completion.percent).toBe(80);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'volunteer.profile_updated' } });
    expect(audit).not.toBeNull();
    expect(audit?.metadata).toMatchObject({
      fields: expect.arrayContaining(['arabicName', 'skills', 'certifications', 'educationInfo']),
    });

    // Restore for later tests.
    await prisma.volunteer.update({
      where: { code: 'ERC-TEST-1' },
      data: { arabicName: null, skills: null, certifications: null, educationInfo: null },
    });
  });

  it('rejects unknown keys (email, identityVerified, status) as strictly off-limits', async () => {
    const { agent, csrf } = await volunteerAgent();
    for (const field of ['email', 'identityVerified', 'status']) {
      const res = await agent
        .patch('/api/volunteer/profile')
        .set('x-csrf-token', csrf)
        .send({ [field]: 'something' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('ignores empty-string text fields but honors an explicit empty array to clear a list', async () => {
    const { agent, csrf } = await volunteerAgent();
    // First add a skill, then send an empty string for a text field (ignored)
    // and an empty array for skills (cleared).
    await agent.patch('/api/volunteer/profile').set('x-csrf-token', csrf).send({ skills: ['First Aid'] }).expect(200);

    const res = await agent
      .patch('/api/volunteer/profile')
      .set('x-csrf-token', csrf)
      .send({ organization: '   ', skills: [] })
      .expect(200);

    expect(res.body.profile.organization).toBe('Teba Hospital'); // unchanged, not cleared
    // An empty list clears the field; the DB persists that as NULL (empty is
    // semantically the same as absent), so the API returns null.
    expect(res.body.profile.skills).toBeNull();
    expect(res.body.completion.checks.skills).toBe(false);

    await prisma.volunteer.update({ where: { code: 'ERC-TEST-1' }, data: { skills: null } });
  });

  it('requires CSRF on the PATCH', async () => {
    const { agent } = await volunteerAgent();
    const res = await agent.patch('/api/volunteer/profile').send({ arabicName: 'x' }).expect(403);
    expect(res.body.error.code).toBe('CSRF_TOKEN_INVALID');
  });

  it('drives completion to 100% only when every check passes', async () => {
    const { agent } = await volunteerAgent();
    // Add every missing field; email already verified. Identity is an admin
    // verdict, so an admin row resolves the last check.
    await prisma.volunteer.update({
      where: { code: 'ERC-TEST-1' },
      data: {
        arabicName: 'متطوع واحد',
        skills: ['First Aid'],
        certifications: ['BLS'],
        educationInfo: 'B.Sc.',
        applicationAnswers: [
          { key: 'why', answer: 'a' },
          { key: 'benefit', answer: 'b' },
        ],
      },
    });
    const partial = await agent.get('/api/volunteer/profile').expect(200);
    expect(partial.body.completion.percent).toBe(90);

    await prisma.volunteer.update({ where: { code: 'ERC-TEST-1' }, data: { identityVerified: true } });
    const complete = await agent.get('/api/volunteer/profile').expect(200);
    expect(complete.body.completion.percent).toBe(100);
    expect(complete.body.completion.passed).toBe(10);
  });
});
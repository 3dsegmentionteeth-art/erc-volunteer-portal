import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, __resetForTests, type Actor } from '../api/client';
import { ApiError } from '../api/error';

const fetchMock = vi.fn();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const ACTOR: Actor = {
  role: 'volunteer',
  userId: 'u1',
  volunteerId: 'v1',
  branchId: 1,
  isHq: false,
  displayName: 'Mona',
  loginId: 'ERC-1001',
} as unknown as Actor;

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  __resetForTests();
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function calls(): Array<{ url: string; init: RequestInit }> {
  return fetchMock.mock.calls.map(([url, init]) => ({ url: String(url), init: (init ?? {}) as RequestInit }));
}

describe('api client', () => {
  it('me() sends credentials and returns the actor', async () => {
    fetchMock.mockResolvedValue(json({ user: ACTOR }));
    const user = await api.me();
    expect(user).toEqual(ACTOR);
    const c = calls()[0];
    expect(c.url).toBe('/api/auth/me');
    expect(c.init.credentials).toBe('include');
    expect(c.init.method ?? 'GET').toBe('GET');
  });

  it('me() returns null on 401', async () => {
    fetchMock.mockResolvedValue(json({ error: { message: 'no', code: 'UNAUTHENTICATED' } }, 401));
    expect(await api.me()).toBeNull();
  });

  it('me() surfaces network failure as ApiError NETWORK_ERROR', async () => {
    fetchMock.mockRejectedValue(new TypeError('boom'));
    const err = await api.me().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('NETWORK_ERROR');
    expect((err as ApiError).status).toBe(0);
  });

  it('login() posts credentials with a fresh CSRF header and swaps the token', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ csrfToken: 'tok-1' }))
      .mockResolvedValueOnce(json({ user: ACTOR, csrfToken: 'tok-2' }));
    const user = await api.login('ERC-1001', 'secret');
    expect(user).toEqual(ACTOR);
    expect(api.csrfToken).toBe('tok-2');
    const [csrfCall, loginCall] = calls();
    expect(csrfCall.url).toBe('/api/auth/csrf-token');
    expect(loginCall.url).toBe('/api/auth/login');
    expect(loginCall.init.headers).toMatchObject({ 'x-csrf-token': 'tok-1', 'Content-Type': 'application/json' });
    expect(JSON.parse(String(loginCall.init.body))).toEqual({ identifier: 'ERC-1001', password: 'secret' });
  });

  it('caches the CSRF token across mutations (fetched once)', async () => {
    const input = { branchId: 'b1', englishName: 'Mona', email: 'mona@e.eg', phone: '0100', password: '12345678' };
    fetchMock.mockResolvedValueOnce(json({ csrfToken: 'tok-1' }));
    fetchMock.mockResolvedValueOnce(json({ registration: { id: 'r1' } }));
    fetchMock.mockResolvedValueOnce(json({ registration: { id: 'r2' } }));
    await api.registerVolunteer(input); // preflight + register
    await api.registerVolunteer(input); // reuse cached token: no new csrf-token call
    const urls = calls().map((c) => c.url);
    expect(urls.filter((u) => u === '/api/auth/csrf-token')).toHaveLength(1);
    expect(urls.filter((u) => u === '/api/volunteer/register')).toHaveLength(2);
  });

  it('retries once with a fresh token when the server rejects CSRF_TOKEN_INVALID', async () => {
    const input = { branchId: 'b1', englishName: 'Mona', email: 'mona@e.eg', phone: '0100', password: '12345678' };
    fetchMock
      .mockResolvedValueOnce(json({ csrfToken: 'stale-tok' }))
      .mockResolvedValueOnce(json({ error: { message: 'stale', code: 'CSRF_TOKEN_INVALID' } }, 403))
      .mockResolvedValueOnce(json({ csrfToken: 'fresh-tok' }))
      .mockResolvedValueOnce(json({ registration: { id: 'r1' } }));
    await api.registerVolunteer(input);
    const seq = calls();
    expect(seq[0].url).toBe('/api/auth/csrf-token');
    expect(seq[1].init.headers).toMatchObject({ 'x-csrf-token': 'stale-tok' });
    expect(seq[2].url).toBe('/api/auth/csrf-token');
    expect(seq[3].init.headers).toMatchObject({ 'x-csrf-token': 'fresh-tok' });
    expect(api.csrfToken).toBe('fresh-tok');
  });

  it('maps the server error envelope to ApiError with stable code and status', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ csrfToken: 'tok-1' }))
      .mockResolvedValueOnce(json({ error: { message: 'taken', code: 'EMAIL_ALREADY_REGISTERED' } }, 409));
    const err = await api.registerVolunteer({ branchId: '1', englishName: 'x', email: 'a@b.c', phone: '01', password: '12345678' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('EMAIL_ALREADY_REGISTERED');
    expect((err as ApiError).status).toBe(409);
  });

  it('registerVolunteer() posts omit empty optional fields', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ csrfToken: 'tok-1' }))
      .mockResolvedValueOnce(json({ registration: { id: 'r1' } }));
    await api.registerVolunteer({ branchId: 'b1', englishName: 'Mona', email: 'mona@e.eg', phone: '0100', password: '12345678' });
    const c = calls()[1];
    expect(c.url).toBe('/api/volunteer/register');
    const body = JSON.parse(String(c.init.body));
    expect(body).not.toHaveProperty('arabicName');
    expect(body).not.toHaveProperty('organization');
    expect(body).not.toHaveProperty('applicationAnswers');
    expect(body.englishName).toBe('Mona');
  });

  it('registerVolunteer() includes non-empty application answers', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ csrfToken: 'tok-1' }))
      .mockResolvedValueOnce(json({ registration: { id: 'r1' } }));
    await api.registerVolunteer({
      branchId: 'b1',
      englishName: 'Mona',
      email: 'mona@e.eg',
      phone: '0100',
      password: '12345678',
      applicationAnswers: [
        { key: 'why', answer: 'To serve my community' },
        { key: 'benefit', answer: 'Skills and purpose' },
      ],
    });
    const body = JSON.parse(String(calls()[1].init.body));
    expect(body.applicationAnswers).toEqual([
      { key: 'why', answer: 'To serve my community' },
      { key: 'benefit', answer: 'Skills and purpose' },
    ]);
  });

  it('branches() returns only the items array', async () => {
    const b = { id: '1', code: 'CAI', nameEn: 'Cairo', nameAr: 'القاهرة' };
    fetchMock.mockResolvedValueOnce(json({ items: [b], total: 1 }));
    const items = await api.branches();
    expect(items).toEqual([b]);
    expect(calls()[0].url).toBe('/api/branches');
    expect(calls()[0].init.method ?? 'GET').toBe('GET');
  });

  it('volunteer time reads unwrap their payloads on GET', async () => {
    fetchMock.mockResolvedValueOnce(json({ summary: { totalMinutes: 210, serviceDays: 2, pendingMinutes: 60, pendingRequests: 1 } }));
    fetchMock.mockResolvedValueOnce(json({ records: [{ id: 'r1' }] }));
    fetchMock.mockResolvedValueOnce(json({ items: [{ id: 'a1' }] }));
    fetchMock.mockResolvedValueOnce(json({ requests: [{ id: 'q1' }] }));
    fetchMock.mockResolvedValueOnce(json({ requests: [{ id: 'e1' }] }));

    expect(await api.volunteerTimeSummary()).toEqual({ totalMinutes: 210, serviceDays: 2, pendingMinutes: 60, pendingRequests: 1 });
    expect(await api.volunteerTimeRecords()).toEqual([{ id: 'r1' }]);
    expect(await api.volunteerTimeAdmins()).toEqual([{ id: 'a1' }]);
    expect(await api.volunteerTimeRequests()).toEqual([{ id: 'q1' }]);
    expect(await api.volunteerEditTimeRequests()).toEqual([{ id: 'e1' }]);

    const urls = calls().map((c) => c.url);
    expect(urls).toEqual([
      '/api/volunteer/time/summary',
      '/api/volunteer/time/records',
      '/api/volunteer/time/admins',
      '/api/volunteer/time/requests',
      '/api/volunteer/time/edit-requests',
    ]);
  });

  it('createTimeAddRequest() posts minutes plus optional assigned admin with CSRF', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ csrfToken: 'tok-1' }))
      .mockResolvedValueOnce(json({ request: { id: 'q1', status: 'pending' } }));
    const req = await api.createTimeAddRequest({ date: '2026-09-22', event: 'Blood Drive', minutes: 120, assignedAdminId: 'a1' });
    expect(req.status).toBe('pending');
    const c = calls()[1];
    expect(c.url).toBe('/api/volunteer/time/requests');
    expect(c.init.method).toBe('POST');
    expect(c.init.headers).toMatchObject({ 'x-csrf-token': 'tok-1' });
    expect(JSON.parse(String(c.init.body))).toEqual({ date: '2026-09-22', event: 'Blood Drive', minutes: 120, assignedAdminId: 'a1' });
  });

  it('createTimeAddRequest() omits the assigned admin when not chosen', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ csrfToken: 'tok-1' }))
      .mockResolvedValueOnce(json({ request: { id: 'q2' } }));
    await api.createTimeAddRequest({ date: '2026-09-22', event: 'Event', minutes: 45 });
    const body = JSON.parse(String(calls()[1].init.body));
    expect(body).not.toHaveProperty('assignedAdminId');
  });

  it('createTimeEditRequest() posts recordId and reason with CSRF', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ csrfToken: 'tok-1' }))
      .mockResolvedValueOnce(json({ request: { id: 'e1', status: 'pending' } }));
    const req = await api.createTimeEditRequest({
      recordId: 'rec-1',
      date: '2026-09-22',
      event: 'Training',
      minutes: 150,
      reason: 'Extra half hour',
    });
    expect(req.status).toBe('pending');
    const c = calls()[1];
    expect(c.url).toBe('/api/volunteer/time/edit-requests');
    expect(JSON.parse(String(c.init.body))).toEqual({
      recordId: 'rec-1',
      date: '2026-09-22',
      event: 'Training',
      minutes: 150,
      reason: 'Extra half hour',
    });
  });
});
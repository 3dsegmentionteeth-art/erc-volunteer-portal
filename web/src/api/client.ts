import { ApiError } from './error';

/** Authenticated actor — mirrors the server's SessionActor serialization. */
export interface Actor {
  role: 'admin' | 'volunteer';
  userId: string;
  adminId?: string;
  volunteerId?: string;
  /** branch_id the actor belongs to; null for HQ admins. */
  branchId: string | null;
  isHq: boolean;
  displayName?: string;
  loginId?: string;
}

export interface Branch {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
}

export interface ApplicationAnswer {
  key: string;
  answer: string;
}

export interface VolunteerRegistrationInput {
  branchId: string;
  englishName: string;
  arabicName?: string;
  email: string;
  phone: string;
  password: string;
  organization?: string;
  /** Optional answers to the application questions ('why' / 'benefit'). Sending
   * the empty array is equivalent to omitting it (server accepts either). */
  applicationAnswers?: ApplicationAnswer[];
}

/** Official service-time record (approved-only by construction). */
export interface ServiceTimeRecord {
  id: string;
  /** UTC-midnight ISO timestamp (the stored calendar date). */
  date: string;
  event: string;
  minutes: number;
  source: 'add_request' | 'admin_adjustment' | 'seed';
  reason: string | null;
  createdAt: string;
}

export interface TimeAdmin {
  id: string;
  fullNameEn: string;
  username: string;
}

export interface TimeAddRequest {
  id: string;
  date: string;
  event: string;
  minutes: number;
  status: 'pending' | 'approved' | 'rejected';
  assignedAdminId: string | null;
  createdAt: string;
  assignedAdmin: { id: string; fullNameEn: string } | null;
}

export interface TimeEditRequest {
  id: string;
  requestedDate: string;
  requestedEvent: string;
  requestedMinutes: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  assignedAdminId: string | null;
  createdAt: string;
  originalDate: string;
  originalEvent: string;
  originalMinutes: number;
  assignedAdmin: { id: string; fullNameEn: string } | null;
  record: { id: string };
}

/** All totals are computed server-side; the SPA renders them verbatim. */
export interface TimeSummary {
  totalMinutes: number;
  serviceDays: number;
  pendingMinutes: number;
  pendingRequests: number;
}

export interface CreateTimeAddRequestInput {
  /** YYYY-MM-DD */
  date: string;
  event: string;
  minutes: number;
  assignedAdminId?: string;
}

export interface CreateTimeEditRequestInput extends CreateTimeAddRequestInput {
  recordId: string;
  reason: string;
}

// --- Phase 5: volunteer self-service profile ------------------------------

export type ProfileCheckKey =
  | 'englishName'
  | 'arabicName'
  | 'idNumber'
  | 'organization'
  | 'skills'
  | 'certifications'
  | 'educationInfo'
  | 'applicationAnswers'
  | 'emailVerified'
  | 'identityVerified';

/** Server-computed onboarding completion; never 100% while a check is missing. */
export interface ProfileCompletion {
  percent: number;
  passed: number;
  total: number;
  checks: Record<ProfileCheckKey, boolean>;
}

export interface VolunteerProfile {
  id: string;
  branchId: string;
  code: string;
  englishName: string;
  arabicName: string | null;
  email: string;
  emailVerified: boolean;
  identityVerified: boolean;
  phone: string | null;
  organization: string | null;
  educationInfo: string | null;
  skills: string[] | null;
  certifications: string[] | null;
  idNumber: string | null;
  applicationAnswers: ApplicationAnswer[] | null;
  createdAt: string;
}

export interface UpdateVolunteerProfileInput {
  englishName?: string;
  arabicName?: string;
  phone?: string;
  idNumber?: string;
  organization?: string;
  educationInfo?: string;
  skills?: string[];
  certifications?: string[];
}

// --- Phase 5: admin time management ----------------------------------------

export interface AdminOverview {
  pendingAddRequests: number;
  pendingEditRequests: number;
  pendingVolunteerMinutes: number;
  approvedMinutes: number;
  approvedThisMonthMinutes: number;
  volunteerCount: number;
  serviceDays: number;
}

export interface TimeRequestVolunteerRef {
  id: string;
  code: string;
  englishName: string;
  arabicName: string | null;
}

export interface BranchRef {
  id: string;
  nameEn: string;
}

/** Add-time request as seen by an admin (branch ref + volunteer ref included). */
export interface AdminAddRequest extends Omit<TimeAddRequest, 'assignedAdmin'> {
  decidedBy: string | null;
  decidedAt: string | null;
  volunteer: TimeRequestVolunteerRef;
  branch: BranchRef;
}

export interface AdminEditRequest extends Omit<TimeEditRequest, 'assignedAdmin'> {
  decidedBy: string | null;
  decidedAt: string | null;
  volunteer: TimeRequestVolunteerRef;
  branch: BranchRef;
}

export interface AdminVolunteer {
  id: string;
  code: string;
  englishName: string;
  arabicName: string | null;
  email: string;
  phone: string | null;
  organization: string | null;
  emailVerified: boolean;
  identityVerified: boolean;
  status: string;
  profileCompletion: number;
  onboardingComplete: boolean;
}

export interface AdminVolunteerDetail {
  volunteer: AdminVolunteer & { branchId: string };
  records: ServiceTimeRecord[];
}

export interface CreateTimeAdjustmentInput {
  volunteerId: string;
  /** YYYY-MM-DD */
  date: string;
  event: string;
  /** Signed: positive adds, negative subtracts. */
  minutes: number;
  reason: string;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE' | 'PATCH' | 'PUT';
  body?: Record<string, unknown>;
  /** Mutating calls require the double-submit CSRF header (global /api rule). */
  csrf?: boolean;
  retried?: boolean;
}

// Module-level CSRF token cache. The token is session-independent (deliberate
// server choice) but the header must re-echo the cookie; we refetch only when
// missing or when the server says the one we hold is stale.
let csrfToken: string | null = null;

// Dev: '' (same-origin, proxied by Vite). Compose `web` container: the host
// API URL is baked at build time so the browser talks to the API directly.
const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');

async function refreshCsrfToken(): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/csrf-token`, { credentials: 'include' });
    const body = (await res.json()) as { csrfToken?: string };
    if (!res.ok || !body.csrfToken) {
      throw new ApiError('Could not obtain the CSRF token.', 'CSRF_FETCH_FAILED', res.status);
    }
    csrfToken = body.csrfToken;
    return csrfToken;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('Could not reach the server.', 'NETWORK_ERROR', 0);
  }
}

function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, csrf = false, retried = false } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (csrf) headers['x-csrf-token'] = csrfToken ?? (await refreshCsrfToken());

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Could not reach the server.', 'NETWORK_ERROR', 0);
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON (e.g. 50x HTML from a proxy) — treat as an unknown failure.
  }

  const error = (data as { error?: { message?: string; code?: string } } | null)?.error;

  // A stale token (usually after login regenerated the session) gets one retry
  // with a fresh token before we surface the failure.
  if (csrf && !retried && res.status === 403 && error?.code === 'CSRF_TOKEN_INVALID') {
    csrfToken = null;
    return requestJson<T>(path, { ...options, retried: true });
  }

  if (!res.ok) {
    throw new ApiError(error?.message ?? `Request failed (${res.status}).`, error?.code ?? 'UNEXPECTED', res.status);
  }

  return data as T;
}

export const api = {
  /** Current cached CSRF token, if any. */
  get csrfToken(): string | null {
    return csrfToken;
  },

  me: async (): Promise<Actor | null> => {
    try {
      const { user } = await requestJson<{ user: Actor }>('/auth/me');
      return user;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },

  login: async (identifier: string, password: string): Promise<Actor> => {
    const res = await requestJson<{ user: Actor; csrfToken?: string }>('/auth/login', {
      method: 'POST',
      body: { identifier, password },
      csrf: true,
    });
    // Login regenerates the session and therefore the token; swap it in.
    if (res.csrfToken) setCsrfToken(res.csrfToken);
    return res.user;
  },

  logout: async (): Promise<void> => {
    await requestJson<{ ok: boolean }>('/auth/logout', { method: 'POST', csrf: true });
    setCsrfToken(null);
  },

  registerVolunteer: (input: VolunteerRegistrationInput) =>
    requestJson<{ registration: { id: string } }>('/volunteer/register', {
      method: 'POST',
      body: {
        ...input,
        arabicName: input.arabicName || undefined,
        organization: input.organization || undefined,
        applicationAnswers: input.applicationAnswers && input.applicationAnswers.length > 0 ? input.applicationAnswers : undefined,
      },
      csrf: true,
    }),

  branches: async (): Promise<Branch[]> => {
    const res = await requestJson<{ items: Branch[] }>('/branches');
    return res.items;
  },

  /** Volunteer dashboard: computed totals (server-side). */
  volunteerTimeSummary: async (): Promise<TimeSummary> => {
    const res = await requestJson<{ summary: TimeSummary }>('/volunteer/time/summary');
    return res.summary;
  },

  volunteerTimeRecords: async (): Promise<ServiceTimeRecord[]> => {
    const res = await requestJson<{ records: ServiceTimeRecord[] }>('/volunteer/time/records');
    return res.records;
  },

  /** Branch supervisors the volunteer may optionally assign a request to. */
  volunteerTimeAdmins: async (): Promise<TimeAdmin[]> => {
    const res = await requestJson<{ items: TimeAdmin[] }>('/volunteer/time/admins');
    return res.items;
  },

  volunteerTimeRequests: async (): Promise<TimeAddRequest[]> => {
    const res = await requestJson<{ requests: TimeAddRequest[] }>('/volunteer/time/requests');
    return res.requests;
  },

  volunteerEditTimeRequests: async (): Promise<TimeEditRequest[]> => {
    const res = await requestJson<{ requests: TimeEditRequest[] }>('/volunteer/time/edit-requests');
    return res.requests;
  },

  createTimeAddRequest: (input: CreateTimeAddRequestInput) =>
    requestJson<{ request: TimeAddRequest }>('/volunteer/time/requests', {
      method: 'POST',
      body: {
        date: input.date,
        event: input.event,
        minutes: input.minutes,
        assignedAdminId: input.assignedAdminId || undefined,
      },
      csrf: true,
    }).then((res) => res.request),

  createTimeEditRequest: (input: CreateTimeEditRequestInput) =>
    requestJson<{ request: TimeEditRequest }>('/volunteer/time/edit-requests', {
      method: 'POST',
      body: {
        recordId: input.recordId,
        date: input.date,
        event: input.event,
        minutes: input.minutes,
        reason: input.reason,
        assignedAdminId: input.assignedAdminId || undefined,
      },
      csrf: true,
    }).then((res) => res.request),

  // --- Volunteer self-service profile ---------------------------------------

  volunteerProfile: async (): Promise<{ profile: VolunteerProfile; completion: ProfileCompletion }> => {
    return requestJson<{ profile: VolunteerProfile; completion: ProfileCompletion }>('/volunteer/profile');
  },

  updateVolunteerProfile: async (
    input: UpdateVolunteerProfileInput,
  ): Promise<{ profile: VolunteerProfile; completion: ProfileCompletion }> => {
    return requestJson<{ profile: VolunteerProfile; completion: ProfileCompletion }>('/volunteer/profile', {
      method: 'PATCH',
      body: { ...input },
      csrf: true,
    });
  },

  // --- Admin time management -------------------------------------------------

  adminTimeOverview: async (): Promise<AdminOverview> => {
    const res = await requestJson<{ overview: AdminOverview }>('/admin/time/overview');
    return res.overview;
  },

  adminTimeAddRequests: async (status?: 'pending' | 'approved' | 'rejected'): Promise<AdminAddRequest[]> => {
    const query = status ? `?status=${status}` : '';
    const res = await requestJson<{ requests: AdminAddRequest[] }>(`/admin/time/add-requests${query}`);
    return res.requests;
  },

  adminTimeEditRequests: async (status?: 'pending' | 'approved' | 'rejected'): Promise<AdminEditRequest[]> => {
    const query = status ? `?status=${status}` : '';
    const res = await requestJson<{ requests: AdminEditRequest[] }>(`/admin/time/edit-requests${query}`);
    return res.requests;
  },

  decideTimeAddRequest: async (id: string, action: 'approve' | 'reject'): Promise<void> => {
    await requestJson(`/admin/time/add-requests/${id}/decide`, { method: 'POST', body: { action }, csrf: true });
  },

  decideTimeEditRequest: async (id: string, action: 'approve' | 'reject'): Promise<void> => {
    await requestJson(`/admin/time/edit-requests/${id}/decide`, { method: 'POST', body: { action }, csrf: true });
  },

  createTimeAdjustment: async (input: CreateTimeAdjustmentInput): Promise<void> => {
    await requestJson('/admin/time/adjustments', { method: 'POST', body: { ...input }, csrf: true });
  },

  adminTimeVolunteers: async (): Promise<AdminVolunteer[]> => {
    const res = await requestJson<{ volunteers: AdminVolunteer[] }>('/admin/time/volunteers');
    return res.volunteers;
  },

  adminVolunteerRecords: async (volunteerId: string): Promise<AdminVolunteerDetail> => {
    return requestJson<AdminVolunteerDetail>(`/admin/time/volunteers/${encodeURIComponent(volunteerId)}/records`);
  },

  identityVerifyVolunteer: async (volunteerId: string): Promise<void> => {
    await requestJson(`/admin/time/volunteers/${encodeURIComponent(volunteerId)}/identity-verify`, {
      method: 'POST',
      body: {},
      csrf: true,
    });
  },

  // --- Phase 6: audit log, activity, service reports, verification ----------

  adminAuditLog: async (query: AuditLogQuery = {}): Promise<Paged<AuditLogEntry>> => {
    const params = new URLSearchParams();
    if (query.page !== undefined) params.set('page', String(query.page));
    if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
    if (query.q) params.set('q', query.q);
    if (query.action) params.set('action', query.action);
    if (query.targetType) params.set('targetType', query.targetType);
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    const qs = params.toString();
    return requestJson<Paged<AuditLogEntry>>(`/admin/audit${qs ? `?${qs}` : ''}`);
  },

  generateServiceReport: async (volunteerId: string): Promise<ServiceReport> =>
    requestJson<ServiceReport>(`/admin/reports/volunteers/${encodeURIComponent(volunteerId)}/report`),

  adminServiceReports: async (
    volunteerId: string,
    query: { page?: number; pageSize?: number } = {},
  ): Promise<Paged<ServiceReportRow>> => {
    const params = new URLSearchParams();
    if (query.page !== undefined) params.set('page', String(query.page));
    if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
    const qs = params.toString();
    return requestJson<Paged<ServiceReportRow>>(`/admin/reports/volunteers/${encodeURIComponent(volunteerId)}/reports${qs ? `?${qs}` : ''}`);
  },

  revokeServiceReport: async (ref: string, reason?: string): Promise<void> => {
    await requestJson<{ revoked: true }>('/admin/reports/revoke', {
      method: 'POST',
      body: { ref, reason: reason?.trim() || undefined },
      csrf: true,
    });
  },

  volunteerActivity: async (query: { page?: number; pageSize?: number } = {}): Promise<Paged<ActivityEntry>> => {
    const params = new URLSearchParams();
    if (query.page !== undefined) params.set('page', String(query.page));
    if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
    const qs = params.toString();
    return requestJson<Paged<ActivityEntry>>(`/volunteer/activity${qs ? `?${qs}` : ''}`);
  },

  verifyRef: (ref: string): Promise<VerificationResult> =>
    requestJson<VerificationResult>(`/verify/${encodeURIComponent(ref)}`),
};

// --- Phase 6 types ----------------------------------------------------------

export interface Paged<T> {
  items: T[];
  meta: { page: number; pageSize: number; total: number };
}

export interface AuditLogEntry {
  id: string;
  actorType: 'admin' | 'volunteer' | 'system';
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  branchId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditLogQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  action?: string;
  targetType?: string;
  /** YYYY-MM-DD */
  from?: string;
  /** YYYY-MM-DD (inclusive) */
  to?: string;
}

/** Volunteer-facing activity entry: a curated projection, never raw metadata. */
export interface ActivityEntry {
  id: string;
  action: string;
  actorType: string;
  actorLabel: string | null;
  createdAt: string;
  date?: string;
  event?: string;
  minutes?: number;
  reason?: string;
  recordId?: string;
  code?: string;
}

export interface ServiceReportPayload {
  generatedAt: string;
  volunteer: { id: string; code: string; englishName: string; arabicName: string | null; branchId: string };
  branch: { id: string; code: string; nameEn: string; nameAr: string };
  recordCount: number;
  totalMinutes: number;
  serviceDayCount: number;
  records: { id: string; date: string; event: string; minutes: number }[];
}

export interface ServiceReport {
  report: ServiceReportPayload;
  verification: { ref: string };
}

/**
 * Admin-only report list row (Phase 6.1): the FROZEN snapshot a printed
 * credential certifies, its revocation state, and — admin-only — the
 * volunteer's CURRENT live totals so a mismatch can be spotted at a glance.
 * The live numbers never reach the public verify endpoint.
 */
export interface ServiceReportRow {
  id: string;
  ref: string;
  issuedAt: string;
  approvedMinutes: number;
  recordCount: number;
  serviceDayCount: number;
  revokedAt: string | null;
  revokedBy: string | null;
  revocationReason: string | null;
  currentApprovedMinutes: number;
  currentRecordCount: number;
  currentServiceDayCount: number;
}

export interface VerificationResult {
  valid: boolean;
  reference: { scope: string; issuedAt: string };
  volunteer: { code: string; englishName: string; arabicName: string | null };
  report: { approvedTotalMinutes: number; recordCount: number; serviceDayCount: number };
}

/** Test-only: re-drop the cached CSRF token between vitest cases. */
export function __resetForTests(): void {
  csrfToken = null;
}
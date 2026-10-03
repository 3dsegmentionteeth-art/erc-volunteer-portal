# ERC Volunteer Service Portal — Architecture

Status: Phase 7 (hardening/release: pinned digests, E2E, load tests, rotation). Target runtime: Node LTS (API images = Node 24 Alpine), Postgres 16.

## 1. High-level topology

```
SPA (React + TS + Vite) ── :5173 ──┐              Phase 3
                                   ├──> API (Node LTS + Express) :4000
Browser                             │              │
  ├ session cookie (erc.sid) ───────┤              ├─ Postgres 16 (sessions,
  └ CSRF cookie (erc.csrf) ─────────┘              │   domain data, audit log)
├─ Redis 7 (+ BullMQ later)
                                                    └─ MinIO (registration documents)
```

The SPA runs containerized (`web/Dockerfile`, `vite preview`). Its `/api`
requests go through a **same-origin dev proxy** to the API container
(`ERC_PREVIEW_PROXY_TARGET`, default `http://app:4000` when wired in compose)
so session/CSRF cookies stay same-site — no CORS surface is introduced for the
SPA at any stage.

Compose (`docker-compose.yml`): `postgres`, `redis`, `minio` always up for dev;
`app` and `web` are behind the `app` profile (`docker compose --profile app up -d --build`).

## 2. Layering (server)

Routes → middlewares → controllers → services → repositories → Prisma/DB.

```
src/
  config/        env parsing + fail-fast prod checks
  lib/           prisma, logger, http (ApiError), password (Argon2id),
                 csrf (double-submit), rateLimit, session
  middleware/    error, validate (zod), auth (requireAuth / requireOwnership /
                 requireBranchScope)
  modules/<domain>/  routes, controller, service, repository, schemas
  routes/        root apiRouter (/health + per-module routers)
  types/         express-session augmentations
  index.ts       bootstrap + graceful shutdown
```

Rules inherited from the spec (kept for the whole project):

- Only **approved** service-time records count toward a volunteer's totals.
- Add/edit time **requests** may carry an optional `assignedAdminId`; admin
  placement/credentials are the request lifecycle, approval creates/edits the
  official record inside one transaction, and a second approval of the same
  request is a no-op (partial-unique indexes + transactional status flip).
- Admin direct time changes require a `reason` (zod + DB CHECK).
- Audit log is **append-only** (UPDATE/DELETE/TRUNCATE all blocked by triggers).
- Onboarding completion is computed server-side from actual field/document
  validity; it may never report 100% while required data is missing.
- Server-side search + pagination; reports/QR docs carry opaque tokens only.

## 3. Request lifecycle (middleware order, `buildApp`)

```
helmet → cors(credentials=true) → express.json(1mb) → cookieParser()
      → sessionMiddleware (connect-pg-simple, Postgres store)
      → '/api' + doubleCsrfProtection   (all mutating /api requests)
      → apiRouter → notFoundHandler → errorHandler
```

CSRF: double-submit. `getSessionIdentifier: () => ''` deliberately — the token is
NOT bound to the session id so it survives session regeneration at login;
mutation then requires the header token to HMAC-match the cookie value.
Cookie is `httpOnly` + `SameSite=Lax`, `secure` in prod, `__Host-` name in prod,
`Max-Age` matches the session lifetime.

Sessions: Postgres store (`session` table, no memory fallback), 7-day max age,
`rolling: true`, session id is regenerated on login (fixation mitigation).

## 4. Authentication

- Login (`POST /api/auth/login`): identifier = admin **username** or volunteer
  **code**. Volunteer codes are upper-cased. Timing-equalized miss path
  (precomputed dummy Argon2id hash) defeats username enumeration by response
  time; identical generic 401 for wrong-password vs unknown-user.
- Passwords: Argon2id, OWASP params (m=19456, t=2, p=1), 32-byte salt via
  `@node-rs/argon2` (NAPI — ABI-stable across Node 20/24/25, musl prebuilds for
  Alpine).
- Session shape (`SessionActor`): `{ role, userId, branchId, isHq, ... }`.
  `role` is a coarse `admin | volunteer`; `role`/`isHq`/`branchId` drive the
  three authorization middlewares.
- Rate limiting: `express-rate-limit` (20 / 15 min on login, 5 / 15 min on
  register) with `express-slow-down` v2 (constant 300 ms after 5) — slow-down
  runs before the hard limit.

## 5. Authorization (middleware contract)

| Middleware              | Grants when                                                            | Fails closed on        |
| ----------------------- | ---------------------------------------------------------------------- | ---------------------- |
| `requireAuth(role?)`    | authenticated session, optionally role-matched (403 if wrong role)     | 401 no session         |
| `requireOwnership(fn)`  | volunteer requesting their own resource; admins pass (scope governs)   | 403 forged owner id    |
| `requireBranchScope(fn)`| HQ admin (bypass) or branch_admin whose `branchId` equals the target   | 403 missing/mismatched branch |

Every Phase-2+ endpoint must compose these (no UI-only hiding). `branch_id` is
NOT NULL on all resource tables, so a well-formed query always yields a scope
target; the middleware still fails closed when one is absent.

## 6. Database constraints

Hand-written migration `20260917002639_db_check_constraints` adds what Prisma's
DSL cannot express. Prisma models keep those columns `String`; PostgreSQL CHECKs
are the source of truth:

- roles: `admins.role IN ('branch_admin','hq_admin')` + branch-scope rule
  (branch_admin MUST have branch, hq_admin MUST NOT).
- lifecycles: registrations `pending|approved|rejected`; volunteers
  `approved|rejected` (volunteers are created only from approved registrations,
  so `pending` volunteers do not exist); documents & requests
  `pending|approved|rejected`; email format regex on registrations/volunteers.
- signs: `service_time_records.minutes <> 0` (signed, legitimately negative for
  official subtractions), add/edit requests `> 0`; `time_add_requests.minutes`,
  `time_edit_requests.requested_minutes` positive.
- required text: non-blank `event`, non-blank audit `action`, non-blank
  `reason` on edit requests and admin adjustments.
- exactly-one-owner on documents: volunteer XOR registration (`(a::int)+(b::int)=1`).
- partial unique indexes: at most one `pending` add request per
  (volunteer,date,event,minutes); at most one `pending` edit per record.

Append-only audit: `trg_audit_logs_append_only` (BEFORE UPDATE OR DELETE) and
`trg_audit_logs_no_truncate` (BEFORE TRUNCATE). Test/DBA cleanup disables the
TRUNCATE guard only with DB TRIGGER privilege (see `tests/helpers.ts`).

## 7. Security control inventory → docs/SECURITY.md

Headers (helmet), CSRF double-submit, server-side sessions in Postgres, argon2id,
login slow-down + hard limit, input validation at every endpoint (zod), DB-level
CHECKs as the last line, audit log, branch scoping, prod fail-fast on weak
secrets, `.dockerignore` + multi-stage images (Node 24 LTS Alpine,
production-only deps).

## 8. Registration & approval workflow (Phase 2a)

```
POST /api/volunteer/register            public; registerLimiter (5/15 min); zod
                                        full-resolve; 201 pending registration
                                        (branch exists + active, email unique)
GET  /api/admin/registrations           requireAuth('admin') → branch-scoped
                                        queue: page/pageSize≤100/search
                                        (name|email|code, SQL ILIKE)
GET  /api/admin/registrations/:id       scoped detail (or 404)
POST /api/admin/registrations/:id/approve  scoped + allowed-state; tx:
                                        registration→approved,
                                        Volunteer created (code ERC-<n+1>,
                                        starts ERC-1001; me=<n> concurrency-safe
                                        SELECT FOR UPDATE), email-verification
                                        token issued (sha256 digest row),
                                        audit "REGISTRATION_APPROVED" in-tx.
                                        P2002 collision → retry (5×).
POST /api/admin/registrations/:id/reject   scoped + allowed-state; tx: state +
                                        reason audit ("REGISTRATION_REJECTED").
POST /api/volunteer/verify-email       public; verifyLimiter (20/1h default);
                                        sha256(token) match → row deleted
                                        (single use), volunteer emailVerifiedAt
                                        set; replay/expired → 400.
POST /api/volunteer/resend-verification  requireAuth('volunteer'); re-issues
                                        + burns all previous tokens in-tx.
```

All mutating endpoints are behind the global double-submit CSRF (section 3).
Branch scoping is enforced in the **service layer** (throws 403
`BRANCH_SCOPE_VIOLATION`) — `requireBranchScope` middleware cannot express the
HQ/null pass-through in a single resource lookup, so the service owns it.
Registration outputs exclude `passwordHash`; the raw verification token is
**never** returned or persisted — only its sha256 digest (Section 7/SECURITY).

Volunteer codes are derived from a monotonic "last code" column (`next_int`)
with `SELECT ... FOR UPDATE` inside the approval transaction; approval is
impossible without a volunteer row, and a second judge of the same registration
gets 409 `REGISTRATION_ALREADY_DECIDED`.

Approval also emits the email-verification link. Three delivery modes in
`lib/mailer.ts`: SMTP (`SMTP_*`) in real deployments; a buffered in-memory
stream transport in tests (`lastCapturedMail()`); a log-only fallback in dev
(never production — SECURITY.md). Resend re-issues + burns old tokens through
the same path.

## 9. Registration documents + presigned retrieval (Phase 2b)

```
POST   /api/registrations/:registrationId/documents   public; CSRF header works
        (multer memory, 5 MB cap, MIME allowlist, 20/15min); pending
        registration required (else 409 REGISTRATION_DECIDED); field "file" +
        text fields "category" (photo|id_document|certificate|other) and
        "applicationAccessToken" (possession proof — see below);
        DB row first, MinIO putObject (key registrations/{registrationId}/{uuid}),
        row rolled back if the object write fails; audit document.uploaded.
DELETE /api/registrations/:registrationId/documents/:documentId
        applicant's own pending document only (409 DECIDED otherwise); JSON body
        field "applicationAccessToken" required; row deleted, object
        removeObject best-effort; audit document.deleted.
GET    /api/admin/registrations/:id/documents          admin, branch-scoped;
        optional `?category=` filter; never exposes objectKey.
POST   /api/admin/documents/:documentId/approve        admin, scoped; reviewable
        only while pending (409 DOCUMENT_ALREADY_REVIEWED); audit
        document.approved.
POST   /api/admin/documents/:documentId/reject         admin, scoped; note
        required; audit document.rejected.
GET    /api/admin/documents/:documentId/download-url   admin, scoped; pre-signed
        URL (expiresInSeconds, default 5 min); bucket stays private.
```

Ownership model: an uploaded document is bound to the registration
(`exactly-one-owner` CHECK, section 6) and inherits its branch. Admin actions
resolve scope from the document's own branch row (403 `BRANCH_SCOPE_VIOLATION`
on mismatch, HQ passes). The decision endpoints guard against reviewing an
already-reviewed document (409 `DOCUMENT_ALREADY_REVIEWED`).

Application-access token (Phase 3 close-out): `registerVolunteer` issues 32
random bytes and stores only the sha256 digest (`application_access_tokens`,
same pattern as email-verification); the raw token is emailed as
`${PUBLIC_HOST}/application/{registrationId}/documents?token=…` and never
persisted or returned by an endpoint. Every public upload/delete verifies it
(DISTINCT 403 codes for missing / invalid / consumed / expired).
Single-use is lifecycle-scoped — one token per registration, burned in the
approve/reject transaction (so post-decision reuse is 409 `REGISTRATION_DECIDED`),
but NOT per request, so one emailed link can attach multiple documents.
See SECURITY.md for the rationale.

## 10. Frontend (Phase 3) + data not modeled yet

The SPA lives in `web/` (React + TS + Vite). API access goes through
`web/src/api/client.ts`, which always fetches a CSRF token first and replays it
as `x-csrf-token` on mutations; on 401 the session is cleared client-side.
i18n: i18next with inline `en`/`ar` resources and a sync `localStorage` +
`navigator` detector; the `<html lang/dir>` attributes are applied from the
resolved `init()` promise (i18next v26 can resolve synchronously and never
re-emits the boot language — see IMPLEMENTATION_PLAN / i18n boot regression
test). Auth pages (`/login`, `/register`) and the placeholder dashboard
(`/`) are wired to the Phase-1/2a endpoints and protected by `RequireAuth`.
`/register` submits `organization` and optional `applicationAnswers`
(`[{key:'why'|'benefit', answer}]`) alongside the required fields; the seed
includes an approved, email-verified demo volunteer (`ERC-1000`) so the
volunteer side is exercisable locally.

Phase 4 adds the volunteer time area: `DashboardShell` is role-aware and
renders `VolunteerDashboard` (stat cards + records + add/edit requests) for
volunteers while admins keep the placeholder module grid. All totals
(`totalMinutes`, `serviceDays`, pending) are computed server-side by the time
module (`/volunteer/time/*`) and rendered verbatim; the SPA never sums records.
Pending add/edit requests are snapshot-only — the live record is untouched
until Phase 5 approval.

Phase 5 adds the administrative side and onboarding gate:
- **`/admin/time/*`** (`server/src/modules/admin-time/*`): `GET overview`,
  `GET add-requests|edit-requests?status=`, `GET volunteers`,
  `GET volunteers/:volunteerId/records` (all server-computed); mutations
  behind `adminTimeLimiter`: `POST add-requests|edit-requests/:id/decide`
  (atomic `updateMany` pending-claim inside a transaction; approve writes the
  live `ServiceTimeRecord`/applies edited values in-tx; second decision →
  409 `TIME_REQUEST_ALREADY_DECIDED`), `POST adjustments` (signed minutes,
  reason required, `AdminTimeAdjustment` ledger row + audit
  `time.adjustment.created` in-tx), `POST volunteers/:volunteerId/identity-verify`.
  Service layer owns branch scope (branch admin → own branch, HQ unscoped; 403
  `BRANCH_SCOPE_VIOLATION`). Audits `time.add_request.approved/rejected`,
  `time.edit_request.approved/rejected`, `volunteer.identity_verified`.
  `identity-verify` is **enforced to follow a real document review**: it 409s
  `ID_DOCUMENT_NOT_APPROVED` unless the volunteer owns at least one `approved`
  `id_document` (matched against their registration's documents, which is where
  production uploads live — Phase 5.1). No flag-flipping path to the 10-check
  gate.
- **`GET/PATCH /volunteer/profile`**: volunteer self-service profile with a
  strict-schema patch (email/identityVerified/applicationAnswers/status are
  server-managed only), completion = 10 server-side checks + per-check
  breakdown, and the time-request lock gate now requires `approved` +
  `emailVerified` + completion == 100% (identity verification is the new
  explicit check that Phase 4's email-verified-only gate lacked).
- Web: `AdminTimeManagement` is mounted directly in the shell for admins
  (overview/requests/volunteers/adjustments); volunteers get `My time` /
  `My profile` tabs (`VolunteerDashboard` / `VolunteerProfile`). The volunteer
  add/edit buttons and forms are locked until completion reaches 100%.

Phase 6 adds the audit view, activity log, and verifiable service reports:
- **`GET /admin/audit`** (`server/src/modules/audit/*`, admin only): branch
  scoping in the service layer (branch admin → own branch rows, HQ unscoped,
  else 403), metadata normalized to verifier-appropriate fields before leaving
  the API, filters (action / actor / targetType / from / to) and `Paged`
  pagination meta computed over the full filtered set. **`GET
  /volunteer/activity`** returns a curated projection of the volunteer's own
  events via OR `actorId = self` | metadata `volunteerId` |
  `targetType = 'volunteer'` + branch pin; raw JSON metadata never leaves the
  server.
- **`POST /admin/reports/volunteer/:volunteerId`** (`server/src/modules/reporting/*`,
  admin + `adminTimeLimiter`): server-computed snapshot + a raw
  `randomBytes(24)` verification reference stored on the report row;
  `service_report.generated` audit. Each report row **freezes the snapshot** at
  generation (`service_reports.approved_minutes/record_count/service_day_count`)
  so later record edits never move what a printed credential certifies.
  **`GET /verify`** (public, `verifyRefLimiter`): returns only verifier-
  appropriate fields from the **frozen** snapshot, and one uniform 404 for
  unknown/malformed/revoked refs (no existence oracle). The verify page
  down-stream (`/verify/:ref`) is a public React route outside `RequireAuth`.
  **Phase 6.1**: an admin-only, branch-scoped `POST /admin/reports/revoke`
  revokes a single reference (monotonic, audited `service_report.revoked` with
  actor + reason; double revoke → 409); the admin list
  `GET /admin/reports/volunteers/:id/reports` pairs each frozen snapshot with
  the volunteer's **current live totals** so divergence is visible — live
  numbers never reach the public endpoint.
- Web: `AdminTimeManagement` gains the `audit` tab (`AdminAuditLog`) and the
  volunteers panel gains report generation → `ReportCard` (QR payload = the
  bare ref, copy link, open-verify link) plus the **`ServiceReportsPanel`**
  shelf (frozen vs live, revoke-with-reason, phase 6.1); `DashboardShell` gains
  the volunteer `activity` tab; `VerifyPage` auto-checks the route ref, renders
one invalid state for every 404, and shows record/service-day counts from the
   frozen snapshot.
- **Phase 6.2 — pre-6.1 backfill (schema + script, no parallel path):**
  `service_reports.snapshot_origin` (migration
  `20260923140000_backfill_service_report_origin`) marks each snapshot as
  live-issued (`NULL`) or migration-backfilled (`'migration-live-backfill'`),
  CHECK-constrained. The backfill itself is a reproducible migration + one-shot
  script (`server/src/scripts/backfill-service-reports.ts`) that **reuses the
  exact `deriveSnapshot` of live report generation** — a single source of truth,
  not a parallel code path that could drift from how real reports compute totals
  — and runs once after `prisma migrate deploy` and before the app accepts
  traffic (operational steps: `docs/DEPLOYMENT.md`, not duplicated here). The
  reasoning behind live-totals backfill over issue-day reconstruction:
  `docs/SECURITY.md` "Service-report backfill decision".

Async BullMQ jobs remain open as a faster-than-inline delivery path; the tables
exist now. Verification references and QR issuance are implemented (Phase 6),
issued inline at report generation rather than through a worker. Time-request
decision updates are plain column updates (allowed) — only the audit log is
append-only.

**Phase 7** hardens the delivery path without changing the application shape:
every container base image is pinned by digest (compose + Dockerfiles), the
runtime carries zero CDN/external asset dependencies (SPA is built same-origin
and MinIO serves its own console), `npm run load-test` measures the per-IP
limiters engaging under sustained concurrency rather than the app degrading,
and `web/e2e/` runs Playwright end-to-end against the real stack (login →
generate → verify round trip plus the uniform-404 invariant). Secrets rotation
and the full deployment procedure live in `docs/DEPLOYMENT.md` /
`docs/SECURITY.md` "Secret rotation".
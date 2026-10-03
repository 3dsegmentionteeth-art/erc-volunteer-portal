# Implementation Plan

Milestone-driven build. Every milestone ends with a QA report (docs/QA.md) and
honest reporting — we never claim something is done without manual + automated
verification against a real running stack.

**Standing rule — phase checkboxes must tell the truth:** when a phase is
flipped to ✅, update that phase's bullet list to reflect what was actually
built, not just the original placeholder line — real bugs found and fixed,
scope deviations from this plan, and new business rules (e.g. caps/windows)
that weren't in the original spec. QA.md and IMPLEMENTATION_PLAN.md must give
the same picture when read alone.

## Phase 1 — Foundation + base auth ✅ (this phase)

- [x] Project scaffold, `.env.example`, docker-compose (postgres/redis/minio).
- [x] Prisma schema (12 models) + migrations (init, CHECK constraints +
  session table + append-only triggers, TRUNCATE guard).
- [x] Auth scaffolding: login / me / logout, CSRF, rate limiting, Postgres
  sessions, argon2id, audit-worthy events, seed (HQ branch + HQ + branch admin).
- [x] Vitest + Supertest integration suite (31 tests) against real Postgres.
- [x] Docs (ARCHITECTURE/SECURITY/QA), README, multi-stage Dockerfile, live
  smoke test, containerized boot validation.

## Phase 2 — Volunteer registration + branch/approval

### 2a — Registration + approval workflow ✅ (this phase)

- [x] Public registration endpoint (`POST /api/volunteer/register`, zod input
  validation, rate-limited, email conflicts rejected, branch exists+active).
- [x] Admin review queue (`GET /api/admin/registrations`, branch-scoped,
  server-side pagination + search on name/email/code).
- [x] Transactional approval: creates the Volunteer with a unique `ERC-<n>`
  code (next-seen int starts at 1000) + writes audit in the same tx; branch
  scope enforced (403 `BRANCH_SCOPE_VIOLATION`), double-approval → 409
  `REGISTRATION_ALREADY_DECIDED`.
- [x] Reject with audit (`reason` required).
- [x] Email verification tokens: issued on approval, hashed (sha256) single-use
  rows, TTL `EMAIL_VERIFICATION_TTL_MS` (24h), `POST /api/volunteer/verify-email`
  rate-limited, `POST /api/volunteer/resend-verification` burns old tokens.
  No SMTP yet — dev logs the link (SMTP = Phase 2b/7).
- [x] Tests: volunteers integration (16) + rate-limit (2); full suite 49/49
  (Phase 1's 31 + 18 new). Build + `npm audit` clean. QA report appended.

### 2b — Documents upload (MinIO) + email delivery ✅

- [x] Applicant document upload: `POST /api/registrations/:registrationId/documents`
  (multipart, CSRF header works, 5 MB cap, MIME allowlist
  png/jpeg/webp/pdf, `photo|id_document|certificate|other` category, 20/15min
  per-IP limit), only while the registration is still pending (409 otherwise).
  Object key `registrations/{registrationId}/{uuid}`; DB row written first,
  MinIO `putObject` on failure rolls the row back; audit `document.uploaded`.
- [x] Applicant deletion of own pending documents
  (`DELETE /api/registrations/:registrationId/documents/:documentId`), removes
  the MinIO object best-effort; audit `document.deleted`.
- [x] Admin review: `GET /api/admin/registrations/:id/documents` (branch-scoped,
  category filter), `POST /api/admin/documents/:id/approve` and
  `.../reject` (note), no double review (409 `DOCUMENT_ALREADY_REVIEWED`),
  audits `document.approved` / `document.rejected`.
- [x] `GET /api/admin/documents/:id/download-url` — time-limited pre-signed URL
  (bucket stays private), minutes-scale TTL.
- [x] Verification emails: SMTP delivery (`SMTP_*` envs), stream transport in
  tests, log-only dev fallback; approve now emits the link (2a gap fixed),
  resend reuses the same path. One-time hashed token unchanged. Seed:
  admin `branch-admin` / `branch-admin-b`.
- [x] Tests: documents integration (8) exercising upload/validation/403/409/
  404, ownership delete + object removal, admin scope + review + audit,
  pre-signed URL round-trip, approve → captured mail → token verifies. Full
  suite 57/57. Build + `npm audit` clean (0). QA report appended.

## Phase 3 — Frontend scaffold (React + TS + Vite) ✅ (this phase)

- [x] Vite SPA with ERC brand tokens, API client on top of the Phase-1 endpoint
  contracts (global double-submit CSRF via `x-csrf-token` + cookie session),
  i18n (i18next; Arabic first-class + RTL), auth pages wired to login/me/logout/
  register + branches.
- [x] Web test suite (17 tests): hermetic `localStorage` polyfill in setup
  (Node's experimental webstorage shadows jsdom), client (CSRF/retry/envelope/
  omit-empty), i18n (persistence + boot regression), LoginPage (roles, error
  banner, links). 9 red → all green; `npm run build` clean.
- [x] Containerized SPA: `web/Dockerfile` (Node 24 Alpine, `vite preview` +
  same-origin `/api` proxy → `app:4000` via `ERC_PREVIEW_PROXY_TARGET`),
  `web/.dockerignore`, compose `web` service on `127.0.0.1:5173` behind
  `--profile app`. No CORS changes — the proxy keeps session/CSRF cookies
  same-site.
- [x] Real browser verification (Playwright, full container stack): `/` guarded
  to `/login` when anonymous; admin login wrong-password → "Incorrect identifier
  or password." alert; correct login → dashboard ("Welcome, Headquarters
  Administrator"); logout → `/login`; register page branch dropdown populated
  from the live API.
- [x] Real bug fixed: an Arabic-first visit rendered Arabic text while `<html>`
  stayed `lang="en" dir="ltr"`. Root cause: i18next v26 can resolve `init()`
  synchronously (inline resources + sync detection) and does not re-emit
  `initialized`/`languageChanged` with the boot language. Fixed by applying the
  document attributes from the resolved `init()` promise (+ `languageChanged`
  listener); regression test added (17th).
- [x] Server container bug fixed (found only when the container first ran):
  the `stream-json: 3.7.0` npm override was a latent breakage — 3.7.x is ESM
  with lowercase file names, while `minio@8.0.7` does a CJS
  `require("stream-json/jsonl/Parser.js")` (capital P); it worked on the
  case-insensitive Windows host and crash-looped the Linux container.
  Override removed → stream-json@1.9.1 nested under minio. Runner now copies the
  build stage's full `node_modules` (npm dev-pruning dropped a prod-required
  package). Both images bumped to Node 24 LTS.
- Server suite 59/59 and web suite 17/17 after the changes; `docker compose
  --profile app up -d --build` boots app (:4000) + web (:5173) verified
  end-to-end through a real browser.
- Remaining not-verifiable locally: volunteer login (seed has no volunteer
  account), SMTP live delivery, pre-signed URL opened in a real browser —
  documented in the QA report, not silently claimed.

## Phase 4 — Volunteer dashboard ✅

- [x] Service-time records view (approved only, server-computed totals; the SPA
  never sums records) + add/edit time requests with optional assigned
  supervisor and status tracking, built as `server/src/modules/time/*` mounted
  at `/volunteer/time` (`requireAuth('volunteer')` + rate limit + CSRF + zod
  validation).
- [x] Role-aware `DashboardShell`: volunteers → `VolunteerDashboard`, admins →
  Phase-5 placeholder grid; new i18n keys in en/ar (Arabic + RTL first-class);
  `web/src/lib/formatMinutes.ts` (`2h 30m`, `−1h` admin subtractions).
- [x] **New business rules added (not in the original spec):** 1440-max
  minutes/day per request; edit window = 14 days from service date, enforced
  **server-side**; assigned admin must be ACTIVE and in the volunteer's own
  branch (400 `INVALID_ASSIGNED_ADMIN`); service days count only records with
  `minutes > 0`; lock gate gated on `approved` + `emailVerified` (403
  `TIME_REQUESTS_LOCKED`).
- [x] **Real bug found and fixed by tests:** `findServiceRecordForVolunteer`
  matched by `id` alone (IDOR — another volunteer's record addressable); now
  scoped `{ id, volunteerId }`.
- [x] Env/behaviour: `time` config block + `.env.example` entries,
  `timeRequestLimiter` (code `TIME_REQUEST_RATE_LIMITED`).
- [x] Web 32/32 (21 baseline + 7 new `VolunteerDashboard.test.tsx` + 4 new
  `client.test.ts`), server 76/76 (14 new time tests). Details + deviations:
  QA.md Phase 4 + Phase 4.1 reports.

## Phase 5 — Admin time management + reports ✅

- [x] Admin time module `server/src/modules/admin-time/*` mounted at
  `/admin/time` (`requireAuth('admin')` + `adminTimeLimiter` on mutations +
  CSRF + zod): overview (server-computed), pending add/edit request lists with
  atomic decide (`updateMany` claim → double decision = 409
  `TIME_REQUEST_ALREADY_DECIDED`), adjustments (signed minutes, 1..1440, reason
  required), volunteer roster with identity verification, per-volunteer
  records. Branch admins scoped to own branch, HQ unscoped (403
  `BRANCH_SCOPE_VIOLATION`). Audits: `time.add_request.approved/rejected`,
  `time.edit_request.approved/rejected`, `time.adjustment.created`,
  `volunteer.identity_verified`.
- [x] Volunteer self-service profile `GET/PATCH /volunteer/profile` (strict
  schema: email/identityVerified/applicationAnswers/status NOT editable;
  empty text ignored, empty arrays clear to NULL; audit
  `volunteer.profile_updated`), and the lock gate now requires **10 server-side
  checks** (englishName, arabicName, idNumber, organization, skills≥1,
  certifications≥1, educationInfo, applicationAnswers≥2, emailVerified,
  identityVerified) — completion% + per-check breakdown returned, never 100%
  while data or verified identity is missing; gate 403 `TIME_REQUESTS_LOCKED`.
  Identity verification: photo/ID documents folded into an explicit admin
  `identity_verified` verdict (Boolean migration applied).
- [x] Web: `AdminTimeManagement` (overview/requests/volunteers/adjustments
  tabs; focused-set search input stays mounted + controlled for focus
  stability; approve/reject also reachable from pending status filter);
  `VolunteerProfile` (read-only + editor; skills/certifications use a real
  `<textarea>` since `<input>` strips newlines; CompletionCard progressbar);
  `DashboardShell` role-aware tabs (volunteers time|profile; admin mounts
  admin module directly); `VolunteerDashboard` disables add/edit buttons +
  shows lock notice below 100%; new `Textarea` component; en/ar i18n incl.
  `profileEmailAddress`.
- [x] Test/build: server 76 → **94/94** (+7 profile +11 admin-time, P2002→409
  overlap with the 1440/edit-window protections covered); web 32 → **45/45**
  (+7 AdminTimeManagement +4 VolunteerProfile +2 dashboard lock-gate); both
  `tsc`/`vite build` green. Full-stack re-verified: compose `--profile app`
  images rebuilt, API smoke (approve, adjustment, identity-verify, profile
  PATCH → 100% → gate opens), browser smoke on both roles. Details: QA.md
  Phase 5.

## Phase 6 — Audit, reports, QR verification ✅

- [x] Audit-log viewer `GET /admin/audit` (`server/src/modules/audit/*`, admin
  only): branch-scoped read of the append-only `audit_logs` (branch admin →
  own branch rows, HQ unscoped, else 403 `BRANCH_SCOPE_VIOLATION`), returns the
  action's structured `metadata` translated into verifier-appropriate fields,
  filters by action (`q`), actor name/id, `targetType`, `from`/`to` dates, and
  stable `Paged` pagination metadata over the full filtered set (never
  page-scoped totals).
- [x] Volunteer activity log `GET /volunteer/activity` (`server/src/modules/audit/*`):
  curated per-volunteer projection (date/event/minutes/reason/recordId/code)
  over their own sign-ins/decisions/adjustments, matched via OR actorId =
  self, metadata `volunteerId`, or `targetType = 'volunteer'` + branch pin —
  the SPA never receives raw JSON metadata either way.
- [x] Service reports `POST /admin/reports/volunteer/:volunteerId`
  (`server/src/modules/reporting/*`, admin, `adminTimeLimiter`): server-computed
  snapshot (name, code, branch, approved total, record/service-day counts) +
  a **raw** 192-bit `randomBytes(24)` verification reference (public QR handle,
  not a secret) written with the report row; each generation audits
  `service_report.generated` with the ref in metadata.
- [x] Public verification `GET /verify` (open, own `verifyRefLimiter`): returns
  only verifier-appropriate fields (name/code/branch/approved total/issued-at)
  as a **frozen snapshot** stored at generation (see Phase 6.1), and a revoked
  report ref returns the same 404 as unknown/malformed ones (no existence
  oracle). Report endpoint is GET-with-write → `reportLimiter`, no CSRF.
- [x] Web: `api/client.ts` types + `adminAuditLog`/`volunteerActivity`/
  `generateServiceReport`/`verifyRef`; `DashboardShell` volunteer `activity`
  tab; `AdminTimeManagement` gets the `audit` tab (AdminAuditLog: table +
  Search/action/target/date filters + pagination) and the volunteers panel gets
  Generate service report → `ReportCard` with a `qrcode` payload of the bare
  ref, a copy-link button, and an open-verify link; public `/verify/:ref` route
  outsides `RequireAuth` (`VerifyPage` auto-checks the route ref, manual lookup
  form, uniform invalid state on 404). `actionLabel.ts`/`verifyUrl.ts` helpers;
  23 `act_*` + audit/report/verify i18n keys in en/ar (strict `Messages`).
- [x] Test/build: server 95 → **109/109** (+14 `phase6-audit-report.test.ts`:
  audit scoping/401/403/filters/pagination, activity isolation, report totals +
  distinct refs, verify field-exposure + uniform 404, cross-branch report 403);
  web 45 → **59/59** (+5 VerifyPage +6 AdminAuditLog +3 VolunteerActivity); both
  `tsc`/`vite build` green; compose images rebuilt + browser smoke (audit log
  filters, report QR, `/verify/:ref` valid + invalid, volunteer activity tab).
  Details: QA.md Phase 6.
- [x] **Phase 6.1 — frozen snapshot + revocation (trust-model change)**: each
  report row now stores the **frozen snapshot** (`service_reports` table +
  migration `20260923130000_service_report_snapshot_details`; `approved_minutes`,
  `record_count`, `service_day_count`) so later record edits never move what a
  printed credential promises. Admin-only, branch-scoped, CSRF-protected
  `POST /admin/reports/revoke` (with optional reason; monotonic — double revoke
  → 409; audited `service_report.revoked` with actor + reason; unknown ref →
  same 404 as verify). Public `GET /verify` serves only the frozen snapshot and
  still 404s uniformly for unknown/malformed/revoked. Admin-only list
  `GET /admin/reports/volunteers/:id/reports` pairs frozen vs **current live**
  totals — live numbers never reach the public endpoint. Web: `ServiceReportsPanel` in the volunteers panel (status, frozen-vs-live, revoke
  with reason in place), VerifyPage shows record/service-day counts, audit
  filter gains `service_report.revoked`.
- [x] Test/build (6.1): server 109 → **113/113** (+4: freeze-under-mutation,
  list frozen-vs-live + pagination + cross-branch 403, revoke scope guards +
  uniform 404 + audited + double-revoke 409 + unknown-ref 404); web 59 →
  **63/63** (+4 `ServiceReportsPanel.test.tsx`); build green; containers rebuilt
  + browser smoke (generate → +30 adjustment → verify stays frozen 6h/4/4,
  revoke w/ reason → uniform 404, audit filter `service_report.revoked`, old
  pre-6.1 ref now uniform-404s). Details: QA.md Phase 6.1.
- [x] **Phase 6.2 — pre-6.1 backfill decision, implemented**: migration
  `20260923140000_backfill_service_report_origin` adds
  `service_reports.snapshot_origin` (NULL = issued; `migration-live-backfill` =
  backfilled; CHECK-constrained) and the reproducibility is a script, not a
  one-off edit: `server/src/scripts/backfill-service-reports.ts` (`npm run
  db:backfill`; prod `node dist/scripts/backfill-service-reports.js`) freezes
  every pre-6.1 `service_report`-scope reference to the volunteer's live totals
  at migration time, idempotently (only refs still missing a row are touched),
  and audits each as `service_report.backfilled` (actorType `system`,
  `migration-backfill`, metadata carries ref/code/totals/origin/migration).
  Server 113 → **120/120** (+7 `phase62-backfill.test.ts`); web unchanged 63/63;
  builds green; lint added for the first time (ESLint 9 flat config + `npm run
  lint`, 0 problems); dev DB backfilled (Phase 6 smoke ref `964c73d1…a085` now
  verifies frozen `390` vs the pre-backfill uniform 404) + containers rebuilt +
  smoke re-run. Details: QA.md Phase 6.2; steps: `docs/DEPLOYMENT.md`.

## Phase 7 — Hardening + release

- [x] **Phase 7 — Hardening + release, completed**: pinned image tags by digest
  (compose + both Dockerfiles), CDN/offline-free image deps review (runtime zero
  external deps; air-gap recipe), load testing (`server/scripts/load-test.mjs`),
  Playwright E2E (`web/e2e/`, 5 specs), secrets rotation (docs/SECURITY.md),
  deploy runbook finished in `docs/DEPLOYMENT.md`. Details: QA.md Phase 7.

## Timing / risks

- Node 25 on the dev machine (targets: fine via NAPI argon2 + Prisma 6.19);
  containers run Node 24 LTS (image base bumped in Phase 3 — validated by
  `docker compose --profile app up --build`). Version pins: Node must stay on
  an LTS line for Alpine NAPI/musl prebuilds.
- Docker Desktop must be running for DB-dependent work: `docker compose up -d`
  after any restart.
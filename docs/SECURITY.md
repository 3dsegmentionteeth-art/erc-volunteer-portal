# Security

Baseline for the ERC Volunteer Service Portal. Own and update this as features
land. Anything here that is silently violated = an incident; report immediately.

## Trust & data boundaries

- Server is the only source of truth. Client-side checks are never trusted:
  every endpoint validates with zod, and DB CHECK constraints backstop lifecycle
  values (statuses, signs, required text, exactly-one document owner).
- Session cookie (`erc.sid`, `__Host-` prefix reserved for prod) is httpOnly +
  SameSite=Lax; the server-side session lives in Postgres, never in memory.
  Get/rotate secrets: see Credentials.

## Authentication

- Passwords: Argon2id, m=19456/t=2/p=1, per-user salt (`@node-rs/argon2`,
  NAPI — ABI-stable across Node versions). Never store plaintext or digestible
  forms; never log hashes.
- Login is rate-limited (20/15 min) behind a slow-down, and the miss path burns
  a constant one Argon2id verification so username existence is not observable
  via response timing; 401 body is identical for unknown-user and wrong-password.
- Session fixation: login regenerates the session id; logout destroys the row.

## CSRF

- Double-submit, enforced globally on every mutating `/api` request.
  `getSessionIdentifier: () => ''` — token deliberately not bound to the
  session id, survives regeneration. Cookies: httpOnly, SameSite=Lax, secure in
  prod. GET /csrf-token overwrites a stale cookie so the SPA self-heals after a
  secret rotation instead of locking users out.

## Authorization

- `requireAuth` (role), `requireOwnership` (volunteer ↔ resource, IDOR guard),
  `requireBranchScope` (branch admin ↔ branch, HQ bypass) — all fail closed.
  Phase-2+ endpoints MUST compose these; there is no UI-only authorization.
- Registration approval/rejection is additionally branch-scoped **in the
  service layer** (not just middleware): a branch admin can only ever act on
  registrations whose `branch_id` matches their own, and HQ passes. The same
  guard covers the review-queue query.

## Email verification (registration approvals)

- Tokens are only issued after an admin approves a registration; they are
  stored **hashed (sha256)** — the database never holds a usable token, so a
  dump cannot be replayed directly.
- Single-use: verification deletes the matched row; a replay of the same token
  fails (SHA mismatch). One outstanding token per volunteer: issuing again
  (approve / resend) atomically burns previous tokens in the same transaction.
- `verify-email` and `resend-verification` are rate-limited (429
  `VERIFY_RATE_LIMITED`) to blunt brute force on the 8-byte token space.
- `EMAIL_VERIFICATION_TTL_MS` (default 24h) bounds token lifetime; expired
  tokens are rejected and removed.
- Delivery (Phase 2b): approved + resent links go out via SMTP
  (`SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD`, STARTTLS on port 587 by default).
  In tests a buffered stream transport captures the message; with no SMTP config
  a **log-only** dev fallback prints the link. Both are telemetrically fine in
  dev; production MUST configure SMTP — the log fallback is a documented
  limitation, never a substitute (it would leak usable tokens to the log). The
  DB still never holds a usable token; only the delivered email/log line does.

## Registration documents (Phase 2b — application-access closing)

- Objects live in a **private** MinIO bucket; the only read path is a
  time-limited pre-signed URL issued to a branch-scoped admin (default 5 min).
  No public/static exposure, no directory listing.
- Uploads are bound to a pending registration and gated by CSRF (global
  double-submit applies to the multipart route — the token travels in the
  `x-csrf-token` header) plus a per-IP rate limit (20/15 min, 429
  `DOCUMENT_UPLOAD_RATE_LIMITED`).
- **Application-access token (Phase 3 close-out):** every upload/delete now
  proves possession of the token emailed at registration — the gap where a
  person with only the registration link could attach files is **closed**.
  Issued server-side as 32 random bytes in `registerVolunteer`; only the sha256
  digest is stored (`application_access_tokens`); the raw token travels only in
  the emailed link (`${PUBLIC_HOST}/application/{registrationId}/documents?token=…`)
  and is never returned by an endpoint. Wrong / cross-registration / missing /
  expired tokens get distinct 403 codes (`APPLICATION_ACCESS_TOKEN_INVALID` /
  `_MISSING` / `_EXPIRED`).
- **Single-use semantics (explicit):** lifecycle-scoped, not per-request. One
  token per registration, `APPLICATION_ACCESS_TOKEN_TTL_MS` default 24 h; it is
  burned (`used_at`) atomically inside the approve/reject transaction, so it can
  never be redeemed after a decision (reuse then fails with 409
  `REGISTRATION_DECIDED`). It is deliberately NOT burned per HTTP request — the
  applicant attaches several documents (photo + id + certificate) from one
  link. If per-request single-use is ever required, swap to an upload-session
  token in the same module; the current choice keeps multi-category uploads
  working and is documented here on purpose.
- Size (5 MB default) and MIME allowlist (png/jpeg/webp/pdf) are enforced by
  multer before the file is persisted; anything else is a 400/413, never a write.
- Documents inherit the registration's `branch_id`; admin review, list and
  download are branch-scoped (HQ passes), failing closed with 403
  `BRANCH_SCOPE_VIOLATION`. Reviewed rows cannot be re-reviewed (409) — a
  rejected document must be replaced by a new upload.
- Object keys are `registrations/{registrationId}/{uuid}` — no user-supplied
  file names ever reach the object key (`sanitizeOriginalName` keeps only a
  display label on the DB row). `Content-Type` is pinned server-side.

## Identity verification (Phase 5.1 — document-gated)

- `POST /admin/time/volunteers/:volunteerId/identity-verify` is **enforced** to
  follow a real review: it succeeds only while the volunteer has at least one
  document with `category = 'id_document'` and `status = 'approved'` owned by
  their registration (production uploads attach to the pending registration and
  link back via `volunteer.registration_id`; the volunteer-owned owner path is
  honored too). No such document, or one still `pending`/`rejected` → **409
  `ID_DOCUMENT_NOT_APPROVED`**, and the identity flag is left untouched.
- This makes the volunteer's 10-check onboarding gate (`identityVerified`)
  unreachable by flag-flipping alone: an admin must first have approved an
  `id_document` in the document-review queue (`documents.status = 'approved'`).
  The review state and the verdict are separate rows and both re-checked — see
  QA.md Phase 5.1.

## Audit log

- Append-only enforced in the database: UPDATE/DELETE and TRUNCATE are blocked
  by triggers. Cleanup/reset requires DB TRIGGER privilege and is never
  reachable through the API.

## Service-report verification (Phase 6)

- Service reports carry a **raw `randomBytes(24)` verification reference** used
  as the QR payload and shortlink tail. It is a **public handle, not a secret**:
  it grants no write path and reveals only what "approved total" already shows
  to an admin — it exists so a third party (employer, university) can verify
  hours without logging in. References are stored raw (not hashed) because the
  ref *is* the lookup key for a public endpoint; the enrolment-with-secret
  trust model is confined to the documents one-time tokens.
- The public `GET /verify` endpoint returns only verifier-appropriate fields
  (name, code, branch, approved total, record/service-day counts, issued-at).
  The totals are the **frozen snapshot** stored when the report was generated via
  `service_reports.approved_minutes` — later record changes never move what a
  printed credential promises, so a held-out copy cannot be silently invalidated.
  Lifecycle can only go forward: revoke is monotonic, nothing un-revokes.
- Unknown, malformed, and revoked references resolve to the **same 404**, so the
  endpoint cannot be used to enumerate which references exist. The React
  `VerifyPage` renders one uniform "not found / revoked / malformed" state.
- **Revocation** is admin-only, branch-scoped (a branch can only revoke refs it
  issued), idempotent-safe (a double revoke is a 409, never a surprise success),
  and always audited: `service_report.revoked` records the reference, the
  acting admin, and the requester-supplied reason. Audit rows are immutable, so
  the story "issued → revoked, by whom, why" is replayable after the fact.
- **Live vs frozen**: only admins see the volunteer's current totals alongside
  the frozen snapshot (`GET /admin/reports/volunteers/:id/reports`). The public
  verify endpoint never returns live numbers — a mismatched credential is a
  data point for a human admin, not an oracle for the internet. Both the admin
  list and the revoke endpoint are branch-scoped; the revoke endpoint also
  returns the same 404 for an unknown ref as the public verify endpoint.
- Rate limits: report generation is behind admin auth + `adminTimeLimiter`; the
  public verify route has its own `verifyRefLimiter` (GET, no CSRF). Revocation
  is a CSRF-protected `POST` behind the admin report limiter.
- QR payloads carry the bare reference only — **no PII ever enters a QR code**.

#### Service-report backfill decision (Phase 6.1 → 6.2)

Phase 6.1 shipped frozen snapshots but did **not** backfill `service_reports`:
references issued before 6.1 have no snapshot row and resolve to the same
uniform 404 as unknown/revoked — consistent and safe, but a real deployment
would hit this the moment it migrates. Decision (made in Phase 6.2): **backfill
from current live totals at migration time** — every pre-6.1 reference with no
snapshot row gets one `service_reports` row computed from the live
`ServiceTimeRecord` totals at the moment the backfill runs, marked
`snapshot_origin = 'migration-live-backfill'`. Why this over the alternatives:
it is cheap, deterministic, and self-describing (the origin column records it
as a backfill, not issued data), and it preserves the invariant that *every
existing reference verifies to exactly what the ledger currently shows*. The
"issue-day reconstruction" alternative was rejected: surplus/negative-adjustment
history is not retained, so replaying it would fabricate a precision the data
cannot support — the snapshot is an honest approximation of "what the ledger
means today," not "what was true on issue day."

Implemented as a reproducible migration + script, not a one-off DB edit:

- Schema: migration `20260923140000_backfill_service_report_origin` adds
  `service_reports.snapshot_origin` (NULL = live issuance;
  `'migration-live-backfill'` = backfilled; CHECK-constrained). Applied
  automatically by `prisma migrate deploy` at container start.
- Script: `server/src/scripts/backfill-service-reports.ts` (`npm run
  db:backfill`; prod `node dist/scripts/backfill-service-reports.js`), run
  AFTER `migrate deploy` and BEFORE exposing the app. It reuses the same
  snapshot derivation as live report generation (`deriveSnapshot`), so a
  backfilled credential certifies exactly what a freshly generated one would
  that moment. One shared clock read sets `issuedAt` for the whole batch.
  Idempotent: it only ever touches `scope='service_report'` references still
  missing a report row, so re-runs are no-ops and freshly issued refs are never
  touched.
- Every backfill is itself an audited event: `service_report.backfilled`
  (`actor_type = 'system'`, `migration-backfill`) carries ref, code, totals,
  origin, and the migration name in metadata; the append-only guard protects
  the trail.
- Verified by `tests/phase62-backfill.test.ts` (+7 server tests) and live on
  the dev stack: the Phase 6 smoke ref `964c73d1…a085` now verifies to a
  frozen `390`-minute snapshot instead of the pre-backfill uniform 404.
  Deployment steps: `docs/DEPLOYMENT.md` (Phase 6.2 backfill runbook).

## Secrets & environment

- `SESSION_SECRET` and `CSRF_SECRET` must be ≥32 random chars in production;
  the app refuses to boot otherwise. Dev values in `docker-compose.yml` and
  `.env.example` are development-only and must never reach an environment
  outside `localhost`.
- Never commit `.env`; `.dockerignore` excludes it from build context.
- Seed passwords (`admin123!`, demo volunteer `volunteer-pass-123`) are
  demo-only — change before any real deploy. The seeded `ERC-1000` volunteer is
  approved + email-verified so the volunteer side is reachable locally; never
  seed it into production.

### Secret rotation

- `SESSION_SECRET`: rotate the env value and restart the app container. Old
  cookies then fail signature verification, so rotation acts as a global
  log-out; server-side `session` rows in Postgres are orphaned, not removed —
  prune with `DELETE FROM session WHERE expire < now();`. There is no dual-secret
  grace period, so schedule rotation for a maintenance window.
- `CSRF_SECRET`: rotate the env value and restart. Stale CSRF cookies fail the
  double-submit check, and the SPA self-heals on its next `GET /csrf-token`
  (overwrites the cookie) — no user action required.
- Database & MinIO credentials: rotate in the secret store, re-point
  `DATABASE_URL` / `MINIO_*` on the app, restart. For MinIO, reconfigure the
  storage service itself to the new keys before restarting the app.
- Sources of truth: all secrets arrive via env / a secret manager — never the
  repo (`.env` is git-ignored and excluded from the Docker build context;
  `docker-compose.yml` values are dev-only).

## Network & abuse

- All compose ports bind to `127.0.0.1` in dev. In production, set
  `TRUST_PROXY_HOPS` to the real reverse-proxy count so rate limiting and audit
  `ip_address` see client addresses — with the default 0 behind a proxy, login
  throttling would collapse onto one key and audits would record the proxy IP.
- Helmet provides baseline headers. Object-storage URLs (Phase 5+) must be
  time-limited and private; QR payloads carry opaque tokens, never PII.

## Dependencies

- `npm audit` status (Phase 3): **2 moderate** — `stream-json <=3.4.0`
  (GHSA-528h-pc64-c93x, JSON-parser DoS) reachable via `minio@8.0.7`. The
  automated fix would force-downgrade to `minio@7.1.3` (breaking the SDK's own
  expected surface); the cleaner fix (pinning `stream-json` 3.7.x via
  `overrides`) was attempted and **reverted**: 3.7.x is an ESM-only release with
  lowercase file names (`parser.js`), while `minio@8.0.7` does a CJS
  `require("stream-json/jsonl/Parser.js")` (capital P) — the container (Linux,
  case-sensitive) crashed with MODULE_NOT_FOUND while the Windows host was
  unaffected. The advisory's affected code path is MinIO's S3-Select JSON parser,
  which the app never calls; the integration suite exercises the actually-used
  MinIO surface (put/get/presign/remove). **Accepted and documented**; re-open
  when minio ships a patched `stream-json` line or the app adopts S3-Select.
- Transitives pinned via `overrides` where safe: `deepmerge-ts` (Phase 1
  advisory), `decode-uri-component` (from `minio`). Keep the list minimal —
  an override that changes major behavior (the `stream-json` 3.7 case) is worse
  than the advisory it silences.
- Re-run `npm audit` and CI on every dependency change. Dev floor is Node 20;
  production images are **Node 24 LTS Alpine** (needed for `require(esm)` on the
  CJS `minio` path and current LTS), relying on prebuilt NAPI/musl artifacts
  (Argon2, Prisma engines) — validated by the containerized suite in Phase 3.
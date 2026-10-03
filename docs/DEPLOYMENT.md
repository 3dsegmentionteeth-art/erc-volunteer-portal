# ERC Volunteer Service Portal — deployment runbook

Production deployment procedure. The pre-6.1 service-report backfill (a real
deployment hits it the moment it migrates) shipped in Phase 6.2; the Phase 7
hardening items below (pinned images, offline/CDN-free image deps, load
testing, Playwright E2E, secrets rotation) are now written up in their own
sections.

## Prerequisites

- Node 20+ for tooling; production images are **Node 24 LTS Alpine**.
- Docker (Desktop or engine) with `docker compose`.
- Postgres 16 (dev: the compose `postgres` service), Redis, MinIO.
- Environment must be set before any step that reads the DB; the server loads
  `.env` via `dotenv/config`. `SESSION_SECRET` and `CSRF_SECRET` ≥32 random
  chars in production (the app refuses to boot otherwise).

## Build & migrate

```sh
docker compose --profile app up -d --build
```

The app container runs `npx prisma migrate deploy` on start before serving, so
schema migrations (including `20260923140000_backfill_service_report_origin`)
apply automatically. For a manual apply:

```sh
cd server && npx prisma migrate deploy
```

## Phase 6.2 — pre-6.1 service-report backfill

Pre-6.1 verification references (issued before the frozen-snapshot trust
model) have no `service_reports` row, so `/verify/:ref` returns the same
uniform 404 as unknown/revoked — for a real deployment every printed/QR
credential handed out before the upgrade would silently read "not found". The
decided remediation (docs/SECURITY.md "Service-report backfill decision"):
freeze each such reference to the volunteer's **live ledger totals at
migration time**, marked `snapshot_origin = 'migration-live-backfill'` — an
honest approximation of what the ledger means today, never the value true on
issue day.

**Run it AFTER `prisma migrate deploy` and BEFORE accepting traffic:**

```sh
# from server/
npm run db:backfill          # dev (tsx; uses .env DATABASE_URL)
node dist/scripts/backfill-service-reports.js   # production image
```

Properties to rely on:

- **Idempotent**: it only ever touches `scope='service_report'` references
  still missing a report row. Re-running is a safe no-op; freshly issued refs
  are never touched.
- **Single source of truth**: snapshots are derived by the exact same
  `deriveSnapshot` logic as live report generation, so a backfilled credential
  certifies what a freshly generated credential would at that moment.
- **Audited**: every backfilled reference writes one `service_report.backfilled`
  audit row (`actor_type = 'system'`, actor `migration-backfill`) carrying ref,
  code, totals, origin, and the migration name. The append-only guard protects
  them; they are the immutable provenance that tells you which rows came from
  the migration.

## Verify the deployment

```sh
# A backfilled reference now verifies with its frozen snapshot:
curl -sS "http://localhost:4000/api/verify/<ref>"

# Backfill rows are queryable and distinguishable from live issuance:
#   SELECT id, reference_id, snapshot_origin, issued_at, approved_minutes
#     FROM service_reports WHERE snapshot_origin = 'migration-live-backfill';
#   SELECT created_at, actor_name, action, metadata
#     FROM audit_logs WHERE action = 'service_report.backfilled';

# A revoked report still 404s uniformly, and the live-vs-frozen admin list still
# shows current totals:
curl -sS -o /dev/null -w "%{http_code}\n" "http://localhost:4000/api/verify/<revoked-ref>"
```

Spot-check at least one reference from each of: a pre-6.1 (backfilled) ref, a
post-6.1 issued ref, and a revoked ref.

## Rollback & safety notes

- The backfill is **additive and idempotent**: no data is deleted or mutated,
  so re-running it after any failure is safe, and it will not be re-executed on
  refs that already have snapshots.
- `audit_logs` is append-only; the `service_report.backfilled` trail is
  permanent.
- Reverting the *outcome* (making a backfilled ref 404 again) would require
  deleting the snapshot row + its audit row — **not supported** and not
  intended: the 404 was itself the bug this runbook step fixes. If a ref was
  backfilled incorrectly, revoke it through the admin flow (uniform 404 +
  audited revocation) rather than deleting.
- Watch `TRUST_PROXY_HOPS` on the real reverse proxy (see docs/SECURITY.md
  "Network & abuse") — otherwise rate limiting and audit `ip_address` collapse
  onto one key and the wrong IP after the proxy.

## Pinned image tags & reproducibility

Every base image is pinned by digest (Phase 7), not a floating tag:

- `docker-compose.yml`: `postgres:16-alpine`, `redis:7-alpine`,
  `minio/minio` (kept at its validated tag), each with `@sha256:…`.
- `server/Dockerfile` and `web/Dockerfile`: both stages on the same
  `node:24-alpine@sha256:…`.

Pins are the **amd64** digests validated on this stack. To re-pin (base-image
upgrade, or an arm64 deploy): `docker pull <image>:<tag>`, read
`docker image inspect --format '{{.RepoDigests}}' <image>:<tag>`, and replace
the digest in the compose file / Dockerfiles. Never edit the digest without
re-running the full verification below.

## Offline / CDN-free image deps

- **Runtime**: no CDN or external assets. The SPA bundles everything at build
  (React, i18next, qrcode); `index.html` carries an inline data-URI favicon;
  MinIO serves its console from the server binary. The browser only ever talks
  to the same origin — `vite preview` proxies `/api` to the API container
  (`ERC_PREVIEW_PROXY_TARGET`), so session/CSRF cookies never cross origins.
- **Build-time** is the only point of network dependence: `npm ci` (package
  registry) and Prisma's engine download during the client's postinstall
  (`binaries.prisma.sh`). To build air-gapped: point npm at an internal
  registry mirror (`.npmrc` `registry=…`) and set `PRISMA_ENGINES_MIRROR` to
  the mirror before `docker compose build`. The runner stages then start with
  zero network — `node_modules` and `dist` are copied from the build stage.

## Load testing

Zero-dependency tool (`server/scripts/load-test.mjs`, `npm run load-test`):

```sh
cd server
npm run load-test -- --path /api/verify/<ref> --concurrency 12 --duration 10000
```

It applies sustained concurrency from one IP, so the per-IP rate limiters are
expected to engage — `429` responses are throttling working as designed and
are **not** a failure. The tool exits non-zero only on `5xx` or transport
errors.

Interpretation (measured on the dev stack, Phase 7): at `concurrency 12` the
verify endpoint held ~1,300 rps with `p99 ≈ 30 ms` and 0 errors, then the
`verifyRefLimiter` ceiling (default `VERIFY_REF_RATE_LIMIT=30`/15 min/IP)
throttled the rest to `429` — exactly the anti-enumeration posture from
docs/SECURITY.md. If a soak on a production-shaped box shows graceful 429s and
no 5xx/latency cliffs, hardening holds. Remember `TRUST_PROXY_HOPS` — behind a
proxy without it, all requests share one IP and the limiters collapse onto a
single key.

## Playwright E2E

Browser suite under `web/e2e/` (`@playwright/test`, spec files
`verify.spec.ts` + `flows.spec.ts`):

```sh
cd web
npm run e2e
```

- Runs against the stack at `http://127.0.0.1:5173`; the web container (or a
  local `vite preview`, which needs `npm run build` once) is reused when
  already up, otherwise Playwright boots it.
- Covers: valid-reference verify (default ref =
  `E2E_VERIFY_REF` or the backfilled reference `964c73d1cede…a085`), the single
  invalid state (unknown/malformed/revoked), interactive check from the search
  box, administrator login → generate report → the fresh reference verifies,
  and volunteer sign-in.
- Generating a report mutates the dev DB (one shelf row per run) — expected.

## Secrets rotation

Procedure in docs/SECURITY.md "Secret rotation". TL;DR: rotate
`SESSION_SECRET` (restart → global log-out; prune `session` rows), rotate
`CSRF_SECRET` (SPA self-heals via `GET /csrf-token`), rotate DB/MinIO
credentials and reconfigure the storage service accordingly. Before any real
deploy, change the seed admin password and never seed the demo volunteer —
all secrets come from env / a secret manager, never the repo.
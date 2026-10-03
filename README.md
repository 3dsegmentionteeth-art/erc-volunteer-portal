# ERC Volunteer Service Portal

A fresh build (not a port of the old prototype) — volunteer service-time
tracking for ERC with branch-scoped admins, approvals, audit trail, and
verifiable reports.

| Stage  | Stack                                   |
| ------ | --------------------------------------- |
| Server | Node LTS (24 in containers), TypeScript, Express, Prisma, PostgreSQL (sessions + data + append-only audit) |
| Web    | React + TypeScript + Vite, containerized (`vite preview`, Phase 3) |
| Data   | Postgres 16, Redis 7, MinIO (documents) |

## Project structure

```
docker-compose.yml     dev stack (postgres/redis/minio; app + web behind --profile app)
server/                Express API (auth, registration/documents; more modules in Phase 4+)
web/                   React SPA (Phase 3-; runs in Docker, dev server for local work)
docs/                  ARCHITECTURE, IMPLEMENTATION_PLAN, SECURITY, QA
```

## Quick start

Requirements: Docker Desktop running, Node ≥ 20 (dev machine; containers use 24 LTS).

```bash
docker compose up -d                 # DB stack (postgres/redis/minio)
cd server
cp .env.example .env                 # dev values are fine locally
npm install
npx prisma migrate deploy            # apply migrations (idempotent)
npm run db:seed                      # branch ERC-HQ + admin/branch-admin
npm run dev                          # API on http://localhost:4000
```

Full stack (API + SPA containers): `docker compose --profile app up -d --build`
→ API on http://localhost:4000, portal on http://localhost:5173 (SPA proxies
`/api` to the API container).

Local SPA dev (live reload, proxies `/api` to `:4000`): `cd web && npm install && npm run dev`.

## Testing

```bash
cd server
npm test        # Vitest + Supertest integration suite (real Postgres, 59 tests)
npm run build   # TypeScript compile check

cd web
npm test        # Vitest + Testing Library (17 tests, jsdom + hermetic storage)
npm run build   # Vite production build + type checking
```

The server test setup creates/migrates `erc_portal_test` automatically. Docker
must be running for the DB stack.

## Demo credentials (development only — rotate before any real deploy)

- HQ admin: `admin` / `admin123!`
- Branch admin: `branch-admin` / `admin123!`

## Docs

- `docs/ARCHITECTURE.md` — layers, middleware order, DB constraints.
- `docs/IMPLEMENTATION_PLAN.md` — milestones (Phases 1–3 ✅).
- `docs/SECURITY.md` — security baseline.
- `docs/QA.md` — per-milestone QA report log.
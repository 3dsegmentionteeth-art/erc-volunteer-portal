# web/ — SPA placeholder

Phase 1 does not include the frontend. This directory is reserved for the
React + TypeScript + Vite SPA, which lands in **Phase 3** (see
`../docs/IMPLEMENTATION_PLAN.md`).

Decisions already made:

- Stack: Vite + React + TypeScript (strict).
- i18n: i18next, Arabic first-class with RTL; resource shape mirrors the old
  prototype's `const T = {...}` key skeleton.
- Auth wiring: cookie sessions + CSRF — the SPA fetches `/api/auth/csrf-token`
  once, echoes `x-csrf-token` on every mutating call, and swaps in the fresh
  token returned by login/logout responses.
- API base URL: `http://localhost:4000` (env-overridable).
- Brand tokens from the reference prototype: `#C70E1A`, `#A90B15`, `#111827`,
  `#667085`, `#F3F3F3`, white.

The `web` compose service stays commented out until then.
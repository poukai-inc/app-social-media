# Changelog

All notable changes to autopost. Format follows [Keep a Changelog](https://keepachangelog.com/);
this project is pre-1.0 and not yet versioned — entries are grouped by work cycle.

## [Unreleased]

### Added — Postgres migration foundation (not yet live)
- Drizzle schema: 18 tables, multi-tenant (`organization_id` on every tenant
  table), 17 pg enums (`db/schema.ts`).
- Row-Level Security policies for tenant isolation, verified on real Postgres
  (`db/migrations/0001_rls_policies.sql`).
- Tenant-scoped repository layer — `withOrg`/`withUser` + 14 repositories
  (`db/queries/*`).
- Idempotent Mongo→Postgres backfill (`scripts/migrate-mongo-to-postgres.ts`,
  one org per existing user).
- Dual-write adapter + 6-phase cutover plan (`lib/db/dual-write.ts`,
  `docs/cutover.md`), flag-controlled (`DB_WRITE`/`DB_READ`).
- NextAuth Drizzle adapter wired behind `AUTH_ADAPTER` (default off).

### Added
- Notification abstraction: `notify()` dispatcher + in-app (Postgres) and email
  (Resend) channels + typed event builders (`lib/notifications/`).
- Test harness: Vitest (unit + in-memory-Mongo integration + real-Postgres) and
  Playwright; coverage gate. 53 unit + 14 integration + Postgres tests.
- CI: 10 required checks (incl. integration + Postgres-service db-tests),
  Renovate, CODEOWNERS, `security.txt`. Architecture doc (`docs/architecture.md`).

### Changed
- TypeScript: full strict mode (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noUnusedLocals/Parameters`, etc.) — 329 errors
  fixed.
- Founder decisions recorded/revised (`decisions/0001`–`0007`): UI → full
  `@poukai-inc/ui` adoption, dark mode → DS-owned, notifications MVP → email +
  in-app.
- Per-page (not global) daily limits for ICP conversation responses.
- `/api/health?detailed=` reports postgres/storage/cron/notifications status.

### Fixed — security (2026-05-29 audit + remediation)
- Cross-tenant IDOR cluster (conversations, learning, ICP-engagement) — page
  ownership now enforced.
- OAuth platform tokens no longer leak via `?data=` redirect URLs (server-side
  one-time `PendingConnection` key); OAuth state HMAC-signed.
- OAuth secrets no longer returned to the client by `GET /api/pages`.
- `/api/health?detailed=` gated behind auth/CRON_SECRET (was anonymous).
- Cron `CRON_SECRET` moved query→header; unauth info-disclosure closed.

### Fixed — correctness
- Publish cron double-publish race — atomic per-post claim (`publishStartedAt`).
- Engage cron lacked a distributed lock — added `withLock` + `extendLock`.
- Distributed-lock release TOCTOU — atomic conditional delete.
- Circuit breaker no longer permanently corrupts its reset timeout on a 403.
- Scheduling honors each page's timezone (`lib/timezone.ts`).
- collect-metrics: ObjectId match fixed (scoring was silently disabled), N+1
  averages memoized, scan bounded.
- Twitter `shares` NaN; wrong-connection token update; AI rate-limit dead
  counter; non-idempotent conversation reply cursor.

### Fixed — performance
- Compound indexes for hot cron/list queries; unbounded list endpoints bounded;
  N+1 lookups batched (engage, publish).

### Operational
- pnpm + Node pin, CI pipeline, `vercel.json` security headers, Mongoose
  pool/timeout hardening, `next-auth` exact-pinned, `docs/cron.md` transport
  decision, `lib/data-sources/README.md`.

### Security — maintainer action
- A GitHub PAT previously present in a local `.env` must be rotated; config
  hardened so it is never committed or baked into images (issue #24).

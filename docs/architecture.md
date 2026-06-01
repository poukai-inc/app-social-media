# Architecture

Autopost is a multi-tenant social-media scheduling + engagement SaaS, packaged
as both a hosted offering and a self-hostable bundle. This document maps the
system as it stands; the live data store is **MongoDB**, with a **Postgres**
target fully built and migration-ready (see `docs/cutover.md`).

> Decision records live in `decisions/`. Migration backlog in `BACKLOG.md`.

## Stack

| Layer | Tech |
|---|---|
| App | Next.js (App Router), React 19, TypeScript (full strict) |
| Live data | MongoDB + Mongoose |
| Target data | Postgres 16 + Drizzle ORM (+ RLS) |
| Object storage | S3-compatible (Cloudflare R2 hosted / MinIO self-host) |
| Auth | NextAuth (Auth.js v5), LinkedIn provider, JWT sessions |
| Email | Resend |
| AI | Groq (default) / Ollama (local), model-pooled with per-model rate limits |
| Cron | Vercel Crons (hosted) · Alpine `scheduler` container (self-host) — `docs/cron.md` |
| License | PIUL-1.0 (proprietary, source-available) — `decisions/0001-licensing.md` |

## Request → data flow

```
Browser ─► Next.js route handler (app/api/**)
             │  auth() session (JWT)  ─► lib/auth.ts
             │  validation
             ▼
        lib/** services ─► Mongoose models (live)
                           └─► (target) db/queries/* repositories ─► Postgres
```

Routes are thin; domain logic lives in `lib/**` (platform adapters, AI client,
engagement, learning, notifications). Today they read/write Mongo; the cutover
moves them onto the Drizzle repository layer.

## Multi-tenancy (Postgres target)

The whole tenancy model is enforced **at the database**, not in application
code:

- Every tenant table carries `organization_id` (FK → `organizations`, cascade).
- **Row-Level Security** (`db/migrations/0001_rls_policies.sql`): each table has
  a `tenant_isolation` policy keyed on `current_org_id()`, which reads the
  `app.current_org_id` GUC. Unset → `NULL` → deny all (fail-closed). `FORCE RLS`
  applies it to the owner role too.
- The repository layer (`db/tenant.ts`) runs each query inside
  `withOrg(orgId, fn)` → a transaction that `SET LOCAL app.current_org_id`.
  A repo method physically cannot touch another org's rows even if a query
  forgets a filter.
- Membership bootstrap (resolving a user's orgs before one is selected) runs
  under `withUser(userId, fn)` + `app.current_user_id` policies. Org creation
  uses a `SECURITY DEFINER` `create_organization()` function (can't satisfy its
  own org-scoped `WITH CHECK`).

Verified in CI: `tests/db/repository.pg.test.ts` proves cross-org isolation
against real Postgres as a non-superuser role.

## Data model (18 tables)

`db/schema.ts`. Core: `organizations`, `organization_members`, `users` (+
NextAuth `accounts`/`sessions`/`verification_tokens`), `pages`, `posts`,
`engagement_targets`, `comment_replies`, `engagement_settings`,
`icp_engagements`, `engagement_history`, `ai_usage`, `token_alerts`,
`comment_suggestions`, `pending_connections`, `notifications`. Nested Mongo
sub-documents map to `jsonb`; status/type unions are pg enums.

## Cron jobs (`app/api/cron/*`)

publish · auto-generate · engage · collect-metrics · conversation-monitor ·
icp-engage · token-refresh. Each is `CRON_SECRET`-authenticated (Bearer header)
and serialized with a Mongo-backed **distributed lock** (`lib/distributed-lock.ts`).
publish/engage use atomic claim markers / `extendLock` to prevent double-action
across overlapping runs. Transport is picked per deploy target (`docs/cron.md`).

## Object storage

Media uploads go to S3-compatible storage (`lib/s3.ts`). Post-cutover, keys are
prefixed by `org_<uuid>` for tenant separation (BACKLOG #27).

## Notifications (`lib/notifications/`)

A single dispatcher — `notify(ctx, msg)` — fans a message out to the org's
channels with per-channel failure isolation (`Promise.allSettled`, logged not
thrown). MVP channels: **in-app** (Postgres `notifications` feed, RLS-scoped) +
**email** (Resend). Slack/Discord are pluggable adapters (P2). Event builders in
`events.ts` keep wording/keys consistent.

## AI client (`lib/ai-client.ts`)

Pools across Groq models by priority, tracking per-model daily/minute usage in
`ai_usage` with a short in-memory cache. Picks the lowest-usage available model;
falls back to unlimited models, then least-used. A circuit breaker
(`lib/circuit-breaker.ts`) trips per upstream on repeated failures (403 →
instant 1h open, stored per-trip so it doesn't corrupt the configured reset).

## Security posture (hardened this cycle)

- RLS tenant isolation (above).
- OAuth: HMAC-signed state (`lib/oauth-state.ts`) + 10-min expiry + session-email
  binding; connection tokens never in redirect URLs — stashed server-side under
  an opaque one-time key (`PendingConnection`, `lib/sanitize-page.ts` strips
  secrets from API responses).
- Cron auth via `Authorization` header from a 0600 secret file.
- `vercel.json` security headers (HSTS, nosniff, Referrer-Policy,
  Permissions-Policy). `lib/data-sources/database.ts` validates identifiers.

## CI (`.github/workflows/ci.yml`)

10 required checks on every PR to `main` (strict, up-to-date branch): Install,
Lint, Typecheck, Build, Dep audit, License allowlist, Secret scan (trufflehog),
Unit tests + coverage, Integration tests (in-memory Mongo), DB repository tests
(real `postgres:16` service). Renovate manages dependencies
(`.github/renovate.json`).

## Migration status

Foundation complete and CI-verified; live app unchanged (Mongo). The cutover —
provision Postgres → backfill (`scripts/migrate-mongo-to-postgres.ts`) →
dual-write → shadow-read → flip reads → flip writes → decommission — is staged
via `DB_WRITE` / `DB_READ` / `AUTH_ADAPTER` flags. See `docs/cutover.md`.

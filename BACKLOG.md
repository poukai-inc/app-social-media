# Autopost — Migration Backlog

**Source**: [MIGRATION_ANALYSIS.md](MIGRATION_ANALYSIS.md) v2.1 — multi-tenant SaaS + self-hostable rewrite
**Last sync**: 2026-05-20
**Total tasks**: 103 (12 C / 45 H / 28 M / 18 L)

## Legend

**Priority** (ascending = do sooner):
- **P0** — blockers; founder decisions + live security exposure
- **P1** — Phase 1 hygiene + Phase 2 Postgres/tenancy/notifications + Phase 3 DS Path C
- **P2** — Phase 4 distribution + Phase 5 observability + Phase 6 tests
- **P3** — post-launch polish

**Severity** (descending = more urgent):
- **C** — critical: security, data-loss, blocks Poukai compliance
- **H** — high: violates Poukai HARD requirement
- **M** — medium: violates SOFT requirement, operational pain
- **L** — low: hygiene, polish

**Status**: `[ ]` open · `[~]` in-progress · `[x]` done · `[!]` blocked

Sort: within each priority bucket, sorted by severity (C → H → M → L), then by phase order, then by file proximity.

---

## P0 — Blockers (do first)

7 founder decisions + 5 live security/correctness fixes. Nothing downstream lands until P0 clears.

### P0-C — Critical

| ID | Status | Task | Output |
|---|---|---|---|
| 1 | `[ ]` | License pick (autopost + `@poukai-inc/ui`) | `LICENSE`, `decisions/0001-licensing.md` |
| 2 | `[ ]` | DB pick confirmation (Postgres + Drizzle) | `decisions/0002-database.md` |
| 3 | `[ ]` | Distribution shape (hosted + self-host bundle) | `decisions/0003-distribution.md` |
| 4 | `[ ]` | Hosting stack (Neon + R2 + Vercel + Resend + Hetzner) | `decisions/0004-hosting.md` |
| 5 | `[ ]` | UI path (Path C hybrid) | `decisions/0005-ui-path.md` |
| 6 | `[ ]` | Dark mode decision (keep / drop / push-to-DS) | `decisions/0006-dark-mode.md` |
| 7 | `[ ]` | Notification channels MVP (email + in-app + Slack) | `decisions/0007-notifications.md` |
| 8 | `[ ]` | Move `CRON_SECRET` query→header | `scheduler/cron-call.sh`, 7× `app/api/cron/*/route.ts` |
| 9 | `[ ]` | Remove hardcoded `192.168.1.9:11434` | `lib/ai-client.ts:36-37` |
| 10 | `[ ]` | Strip placeholder secrets from `Dockerfile` build env | `Dockerfile:18-31` |
| 11 | `[ ]` | Delete tracked backup file | `lib/platforms/twitter-adapter.ts.backup` |
| 12 | `[ ]` | Remove `EMAIL_FROM` default `noreply@schedular.primestrides.com`; env-required, fail-fast | `lib/email.ts:14` |

---

## P1 — Phase 1 hygiene + Phase 2 Postgres/tenancy/notifications + Phase 3 DS Path C

37 high + 8 medium tasks. Largest single bucket. Three parallel tracks possible after Phase 1: DB/tenancy, notifications, UI Path C.

### P1-H — High (Poukai HARD requirement violations)

#### Phase 1 — Operational hygiene (1 wk, BLOCKING)

| ID | Status | Task | File(s) |
|---|---|---|---|
| 13 | `[ ]` | Switch to pnpm; Node pin `>=20 <21` | `package.json`, lockfiles |
| 14 | `[ ]` | Add CI (install/lint/typecheck/build/audit/gitleaks/license-check/test) | `.github/workflows/ci.yml` (new) |
| 15 | `[!]` | ~~Drop dead deps (`mysql2`, `dotenv`)~~ — **NOT DEAD**: `mysql2` used in `lib/data-sources/database.ts:1,54,67,159` (data source connector for external MySQL DBs); `dotenv` used in 20 `scripts/*.mjs|.cjs`. Re-scope: audit each, keep both. New sub-tasks: (15a) document MySQL data-source purpose in `lib/data-sources/README.md`; (15b) consider replacing `dotenv` in scripts with native Node 20 `--env-file` flag | `lib/data-sources/database.ts`, `scripts/*` |
| 16 | `[ ]` | Resolve `O_API_KEY`/`OPENAI_API_KEY` drift | `docker-compose.yml`, `.env.example` |
| 17 | `[ ]` | `console.*` → `lib/logger.ts`; eslint `no-console: error` | repo-wide |
| 18 | `[ ]` | `vercel.json` security headers (HSTS, nosniff, Referrer-Policy, Permissions-Policy) | `vercel.json` |
| 19 | `[ ]` | Pick **one** cron transport per deploy target; document | `vercel.json`, `scheduler/`, `docs/cron.md` |
| 20 | `[ ]` | Mongoose interim hardening (timeouts, pool size) | `lib/mongodb.ts` |

#### Phase 2 — Postgres + multi-tenancy + notifications (2-3 wks)

| ID | Status | Task | File(s) |
|---|---|---|---|
| 21 | `[ ]` | Drizzle schema (`db/schema.ts`) — 9 models + `Organization` + `OrganizationMember` + `Notification` | `db/schema.ts` (new) |
| 22 | `[ ]` | RLS policies on all tenant tables | `db/migrations/*_rls.sql` |
| 23 | `[ ]` | Repository layer: every query takes `orgId` first arg | `db/queries/*.ts` (new), `app/api/**` |
| 24 | `[ ]` | Mongo→Postgres migration script (idempotent) | `scripts/migrate-mongo-to-postgres.ts` (new) |
| 25 | `[ ]` | Dual-write window adapter + cutover plan | `lib/db/dual-write.ts` (temporary), `docs/cutover.md` |
| 26 | `[ ]` | NextAuth `@auth/drizzle-adapter`; remove Mongo session storage | `lib/auth.ts` |
| 27 | `[ ]` | S3 key prefixing by `org_<uuid>` | `lib/s3.ts` |
| 28 | `[ ]` | Per-org `AIUsage` (add `organization_id`) | `db/schema.ts`, `lib/ai-client.ts` |
| 29 | `[ ]` | Per-org OAuth credentials (BYO LinkedIn/Twitter/Facebook apps); encrypted at rest | `db/schema.ts`, `app/api/auth/**`, `app/dashboard/pages/[id]/settings/page.tsx` |
| 30 | `[ ]` | First-boot wizard (zero orgs → create Org #1 + owner) | `app/setup/page.tsx` (new), middleware redirect |
| 31 | `[ ]` | Multi-tenant isolation test harness (org A can't see org B) | `tests/isolation/*.test.ts` (new) |
| 32 | `[ ]` | Notification abstraction `lib/notifications/` (dispatcher + channels + events) | `lib/notifications/` (new) |
| 33 | `[ ]` | Migrate email call sites → `notify(orgId, event, data)` | `app/api/blog/generate/route.ts`, `app/api/cron/auto-generate/route.ts`, `app/api/cron/token-refresh/route.ts` |
| 34 | `[ ]` | In-app notification feed (DB + dashboard bell + read/unread) | `db/schema.ts`, `app/dashboard/notifications/`, `components/ui/notification-bell.tsx` |
| 35 | `[ ]` | Slack webhook channel adapter | `lib/notifications/channels/slack.ts` (new) |

#### Phase 3 — Design system Path C hybrid (2-3 wks)

| ID | Status | Task | File(s) |
|---|---|---|---|
| 36 | `[ ]` | `.npmrc` + `NPM_TOKEN` (Vercel env); install `@poukai-inc/ui` | `.npmrc` (new) |
| 37 | `[ ]` | React 19 ↔ DS peerDep `>=18` validation | `package.json` |
| 38 | `[ ]` | Pin `lucide-react` to DS-compatible range (`>=0.400.0 <0.600.0`) | `package.json` |
| 39 | `[ ]` | Import `@poukai-inc/ui/tokens.css` | `app/layout.tsx` |
| 40 | `[ ]` | Build `components/ui/` app-local primitives (~25 files on Radix + DS tokens) | `components/ui/{input,textarea,select,combobox,checkbox,radio-group,switch,label,helper-text,error-message,spinner,skeleton,toast,tooltip,progress-bar,dropdown-menu,tabs,pagination,empty-state,breadcrumb,date-picker,time-picker,file-uploader,form-field,data-table}.tsx` |
| 41 | `[ ]` | Build `AppShell` organism extending DS `SiteShell` | `components/app-shell.tsx` (new) |
| 42 | `[ ]` | Replace navbar with `AppShell` | `components/navbar.tsx` (delete), `app/layout.tsx` |
| 43 | `[ ]` | Replace ad-hoc atoms with DS where shape fits | `components/*.tsx` |
| 44 | `[ ]` | Replace dashboard forms with `components/ui/` primitives | `components/post-form.tsx`, `structured-input-form.tsx`, `app/dashboard/pages/**/settings/page.tsx` |
| 45 | `[ ]` | Brand-override contract (env-driven CSS vars: `BRAND_PRIMARY`/`WORDMARK_URL`/`NAME`/`FAVICON_URL`) | `app/brand-override.css` (new), `app/layout.tsx` |
| 46 | `[ ]` | Push DS PR: `Wordmark` `src` prop (or new `BrandMark` atom) | `poukai-ui` PR |
| 47 | `[ ]` | Dark mode — implement Phase 0 0f decision | `app/globals.css`, `app/brand-override.css` |
| 48 | `[ ]` | Token-ize hardcoded brand colors | `components/navbar.tsx:57`, `components/**` |
| 49 | `[ ]` | Extract inline platform SVGs to `components/icons/platforms/` | `components/icons/platforms/{linkedin,twitter,facebook,instagram}.tsx`, `components/post-card.tsx` |

### P1-M — Medium

| ID | Status | Task | File(s) |
|---|---|---|---|
| 50 | `[ ]` | Replace cards with DS molecules where shape fits (`LinkCard`, `FeatureCard`, `TeamCard`, `Quote`) | `components/*card*.tsx` |
| 51 | `[ ]` | Zod input validation on all `/api/*` bodies | `app/api/**/route.ts` |
| 52 | `[ ]` | ESLint flat config matching `poukai-ui` | `eslint.config.mjs` |
| 53 | `[ ]` | Prettier config matching `poukai-ui` | `.prettierrc` (new) |
| 54 | `[ ]` | License-check CI gate (MIT/Apache-2.0/ISC/BSD allowlist) | `.github/workflows/ci.yml`, `.github/scripts/license-check.mjs` |
| 55 | `[ ]` | Pin all prod deps to exact versions (R-065) | `package.json` |
| 56 | `[ ]` | `.gitignore` entries for `.omc/`, `.vercel/`, `.next/`, IDE | `.gitignore` |
| 57 | `[ ]` | Axe a11y test on top 5 dashboard routes | `tests/a11y/` (new) |
| 104 | `[ ]` | Fix ~718 ESLint errors blocking lint CI gate (was 61 under old config; new poukai-ui-style rules surface more: ~660 no-console, 127 consistent-type-imports, 98 no-unused-vars, 27 no-explicit-any). C1 console-logger migration drains the bulk. Remove `continue-on-error` from `.github/workflows/ci.yml` lint job after | repo-wide |
| 106 | `[ ]` | Tighten jsx-a11y beyond `next/core-web-vitals` baseline to full `recommended` set (R-024..R-033). Requires either forking next/core-web-vitals or registering jsx-a11y under an alias in eslint.config.mjs | `eslint.config.mjs` |
| 105 | `[x]` | ~~Fix `tsc --noEmit` errors~~ — DONE (2026-05-20): 11 errors fixed across 7 files (mongoose 9 strict types, TokenAlert.platform narrowing, countDocuments cast); typecheck CI gate now hard | done |

---

## P2 — Phase 4 distribution + Phase 5 observability + Phase 6 tests

15 high + 13 medium tasks. Only meaningful after multi-tenancy lands.

### P2-H — High

#### Phase 4 — Distribution packaging (1 wk)

| ID | Status | Task | File(s) |
|---|---|---|---|
| 58 | `[ ]` | Hosted SaaS env wiring (Neon `DATABASE_URL`, R2 `S3_ENDPOINT`/keys, Resend API key, Vercel project) | Vercel env, `.env.example` |
| 59 | `[ ]` | `autopost-selfhost/` bundle scaffold | new directory |
| 60 | `[ ]` | `docker-compose.bundle.yml` (app + `postgres:16-alpine` + `minio` + `scheduler` + optional matomo/bugsink) | `autopost-selfhost/docker-compose.yml` |
| 61 | `[ ]` | `caddy/Caddyfile` reverse proxy + auto-TLS | `autopost-selfhost/caddy/` |
| 62 | `[ ]` | `scripts/install.sh`, `upgrade.sh`, `backup.sh` (`pg_dump` + minio snapshot), `restore.sh` | `autopost-selfhost/scripts/` |
| 63 | `[ ]` | Versioned release pipeline (tag → GHCR push + bundle tarball) | `.github/workflows/release.yml` (new) |
| 64 | `[ ]` | Changesets adoption (matches `poukai-ui`) | `.changeset/` (new) |
| 65 | `[ ]` | `RUN_MIGRATIONS=true` runs `drizzle-kit migrate` on container start | `Dockerfile`, entrypoint script |
| 66 | `[ ]` | Self-host docs (install, upgrade, BYO-OAuth, BYO-AI, notification channels, security, backup) | `autopost-selfhost/docs/` |
| 67 | `[ ]` | Discord webhook channel adapter | `lib/notifications/channels/discord.ts` (new) |

#### Phase 5 — Observability & cron unification (0.5 wk)

| ID | Status | Task | File(s) |
|---|---|---|---|
| 68 | `[ ]` | Wire Bugsink (server + browser); PII scrub | `app/layout.tsx`, `lib/**` |
| 69 | `[ ]` | Wire Matomo on dashboard routes (env-gated) | `app/dashboard/**`, `app/layout.tsx` |
| 70 | `[ ]` | Health endpoint expansion (db/storage/ai/cron/notifications status) | `app/api/health/route.ts` |

#### Phase 6 — Tests, validation, platform cleanup (1-1.5 wks)

| ID | Status | Task | File(s) |
|---|---|---|---|
| 71 | `[ ]` | CSRF state validation audit (Twitter, Facebook OAuth callbacks) | `app/api/auth/twitter/callback/route.ts`, `facebook/callback/route.ts` |
| 72 | `[ ]` | Rate limiting on `/api/generate`, `/api/blog/*`, `/api/upload` (Postgres advisory locks) | `app/api/**/route.ts` |

### P2-M — Medium

| ID | Status | Task | File(s) |
|---|---|---|---|
| 73 | `[ ]` | Per-cron metrics (start/duration/success/count) | `app/api/cron/**` |
| 74 | `[ ]` | Per-org cron loops (one slow tenant must not block others) | `app/api/cron/**` |
| 75 | `[ ]` | Unit tests for `lib/ai-client.ts` (model selection, rate-limit branches) | `lib/__tests__/ai-client.test.ts` (new) |
| 76 | `[ ]` | Unit tests for `lib/platforms/*-adapter.ts` | `lib/platforms/__tests__/` |
| 77 | `[ ]` | Unit tests for `lib/notifications/` (dispatcher + each channel adapter) | `lib/notifications/__tests__/` (new) |
| 78 | `[ ]` | Integration tests for `/api/cron/*` (mocked DB + platform APIs + notifications) | `app/api/cron/__tests__/` |
| 79 | `[ ]` | E2E: signup → org create → LinkedIn connect → page → generate → schedule → publish + notification fires | `tests/e2e/` (new) |
| 80 | `[ ]` | Reach ≥80% changed-file coverage (R-058) | repo-wide |
| 81 | `[ ]` | Confirm Groq path live or delete | `lib/ai-client.ts` |
| 82 | `[ ]` | Remove DEPRECATED `Post` fields (`linkedinPostId`, `performance`) | `db/schema.ts` (Post table) |
| 83 | `[ ]` | Document platform-adapter contract for adding Instagram | `lib/platforms/README.md` (new) |
| 84 | `[ ]` | Document secret-rotation policy per env (Neon, R2, Resend, OAuth, Groq) | `docs/secrets-rotation.md` |
| 85 | `[ ]` | Decide ELK vs Bugsink long-term; drop `elk` network from compose if dead | `docker-compose.yml` |

---

## P3 — Post-launch polish

0 critical, 0 high, 0 medium, 18 low. None blocking; wraps the migration.

### P3-L — Low

| ID | Status | Task | File(s) |
|---|---|---|---|
| 86 | `[ ]` | Conventional Commits enforcement (commitlint + husky) | `commitlint.config.mjs`, `.husky/` |
| 87 | `[ ]` | Renovate/Dependabot (auto minor/patch) | `.github/renovate.json` |
| 88 | `[ ]` | `.well-known/security.txt` once `security@pouk.ai` lives | `public/.well-known/security.txt` |
| 89 | `[ ]` | `CODEOWNERS` if multi-contributor | `.github/CODEOWNERS` |
| 90 | `[ ]` | Branch protection rules on `main` | GitHub settings |
| 91 | `[ ]` | Stripe billing scaffolding (hosted only, flagged) | `lib/billing/`, `app/dashboard/billing/` |
| 92 | `[ ]` | Per-org Resend domain verification (per-org sender) | `lib/email.ts`, new dashboard page |
| 93 | `[ ]` | Per-org plan tier feature flags | `lib/feature-flags.ts` |
| 94 | `[ ]` | Telegram bot channel adapter | `lib/notifications/channels/telegram.ts` (new) |
| 95 | `[ ]` | Split `lib/openai.ts` (1.4k lines) per-platform | `lib/prompts/{linkedin,twitter,facebook,instagram}.ts` |
| 96 | `[ ]` | Split `Post` table types (focused Zod schemas per concern) | `lib/types/post/`, `db/schema.ts` |
| 97 | `[ ]` | Replace `MONGODB_URI` legacy env reference with `DATABASE_URL` | `.env.example`, docs |
| 98 | `[ ]` | `CHANGELOG.md` (this `BACKLOG.md` + matches `poukai-ui`) | repo root |
| 99 | `[ ]` | `docs/architecture.md` (compose topology, RLS model, cron split, S3 layout, notification flow) | `docs/architecture.md` (new) |
| 100 | `[ ]` | Admin surface for hosted SaaS: super-admin org list, impersonation audit log | `app/admin/` (new) |
| 101 | `[ ]` | Telemetry opt-in for self-host (anonymized version + feature usage; env-gated default-off) | `lib/telemetry.ts` (new) |
| 102 | `[ ]` | i18n scaffolding (en first, then es/pt) | `next-intl` or equivalent |
| 103 | `[ ]` | Post-launch evaluation: migrate to Supabase Auth / push more atoms upstream to DS | TBD |

---

## Snapshot by priority × severity

|        | C  | H  | M  | L  | **Total** |
|--------|----|----|----|----|-----------|
| **P0** | 12 |  0 |  0 |  0 | **12** |
| **P1** |  0 | 37 |  8 |  0 | **45** |
| **P2** |  0 | 15 | 13 |  0 | **28** |
| **P3** |  0 |  0 |  0 | 18 | **18** |
| **Total** | **12** | **52** | **21** | **18** | **103** |

## Phase ↔ tasks map

| Phase | Tasks | Calendar |
|---|---|---|
| Phase 0 — Founder decisions | 1-7 | < 1 wk |
| Phase 1 — Operational hygiene | 8-12, 13-20 | 1 wk |
| Phase 2 — Postgres + tenancy + notifications | 21-35 | 2-3 wks |
| Phase 3 — DS Path C | 36-50 | 2-3 wks |
| Phase 4 — Distribution packaging | 58-67 | 1 wk |
| Phase 5 — Observability | 68-70 | 0.5 wk |
| Phase 6 — Tests + validation + cleanup | 71-85 | 1-1.5 wks |
| Post-launch polish | 86-103 | rolling |

**Solo**: 7-9 wks. **Pair**: 5-6 wks.

## Working agreement

- Mark `[~]` when starting; `[x]` when merged to `main`; `[!]` when blocked (note blocker inline).
- Reference task ID in commit subject (`feat(p1-21): drizzle schema for Organization`).
- Reference task ID in PR title + body.
- Update [MIGRATION_ANALYSIS.md](MIGRATION_ANALYSIS.md) when scope changes; re-sync this file (`pnpm sync:backlog` if scripted later).
- Do not skip P0. Do not start Pn+1 before Pn is ≥80% drained except where parallel tracks are explicit (P1 has DB / notifications / UI as parallel).

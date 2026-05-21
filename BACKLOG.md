# Autopost — Migration Backlog

**Sources**:
- [MIGRATION_ANALYSIS.md](MIGRATION_ANALYSIS.md) v2.1 — multi-tenant SaaS + self-hostable rewrite
- [STACK_ALIGNMENT_DECISIONS.md](https://github.com/poukai-inc/poukai-org-meta/blob/main/STACK_ALIGNMENT_DECISIONS.md) (2026-05-20) — cross-repo stack alignment (D1–D7)

**Last sync**: 2026-05-20
**Total tasks**: 120 (15 C / 58 H / 27 M / 20 L)

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

7 founder decisions + 5 live security/correctness fixes + 3 new critical security findings (2026-05-20 audit). Nothing downstream lands until P0 clears.

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
| 107 | `[x]` | **[AUDIT-C1]** Add auth guard to `POST /api/posts/[id]/approve` — no `auth()` call in POST handler; any unauthenticated caller who knows a post ObjectId can approve/reject/schedule/publish. Add session check + verify `post.userId === user._id` | `app/api/posts/[id]/approve/route.ts:178` |
| 108 | `[x]` | **[AUDIT-C2]** SSRF in blog URL fetcher — no URL validation; direct `fetch(url)` fallback when Jina fails allows probing `169.254.169.254`, `localhost`, private subnets. Fix: validate URL (allowlist `http/https`, block private/loopback/link-local ranges), remove direct-fetch fallback entirely | `app/api/blog/analyze/route.ts:30-59` |
| 109 | `[x]` | **[AUDIT-C3]** Prompt injection — external content (blog fetch, DB data-source body, live Twitter tweets) injected verbatim into LLM prompts with no sanitization. Fix: wrap in `<UNTRUSTED_EXTERNAL>` XML delimiters, add system-prompt note marking them untrusted, strip `ignore.*instructions` / `you are now` / `disregard` patterns before injection | `lib/openai.ts:425`, `app/api/generate/route.ts:117`, `lib/engagement/icp-engagement-agent.ts:748` |

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
| 110 | `[ ]` | **[AUDIT-H1]** OAuth tokens in redirect URL — Twitter refresh token (permanent) + Facebook page tokens base64'd in `?data=` query param; appear in server access logs, browser history, Referer headers. Fix: store pending connection data in short-lived signed server-side session; redirect with opaque one-time key only | `app/api/auth/twitter/callback/route.ts:169`, `app/api/auth/facebook/callback/route.ts:229` |
| 111 | `[ ]` | **[AUDIT-H2]** HMAC-sign OAuth state param — state is plain base64 JSON, forgeable by any authenticated user; attacker can craft state targeting another user's `pageId` or a future `email`. Fix: sign with `NEXTAUTH_SECRET` via HMAC-SHA256; verify `state.email === session.user.email` in callback. Supersedes audit scope of #71 | `app/api/auth/twitter/route.ts:52`, `app/api/auth/facebook/route.ts`, both callbacks |
| 117 | `[ ]` | **[D2]** Bootstrap test harness — install `vitest`, `@vitest/coverage-v8`, `@playwright/test`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `mongodb-memory-server`, `testcontainers`. Add `vitest.config.ts`, `playwright.config.ts`. Add CI jobs for unit + integration + E2E with 80% coverage gate. Prereq for tasks #75–80. See [STACK_ALIGNMENT_DECISIONS.md#d2](https://github.com/poukai-inc/poukai-org-meta/blob/main/STACK_ALIGNMENT_DECISIONS.md) | `package.json`, `vitest.config.ts` (new), `playwright.config.ts` (new), `.github/workflows/ci.yml` |
| 118 | `[ ]` | **[D5]** TypeScript strict big-bang — add `tsconfig.json` overrides: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`, `noFallthroughCasesInSwitch`. Fix all `tsc --noEmit` errors in a single PR. Matches `poukai-ui` strictness. Coordinate with #117 — write tests for hot paths first where feasible. See [STACK_ALIGNMENT_DECISIONS.md#d5](https://github.com/poukai-inc/poukai-org-meta/blob/main/STACK_ALIGNMENT_DECISIONS.md) | `tsconfig.json`, repo-wide |
| 119 | `[ ]` | **[D3]** Exact-pin `next-auth` beta — change `^5.0.0-beta.30` to `5.0.0-beta.30` (exact). Add Dependabot/Renovate rule requiring manual review for any `next-auth` bump. See [STACK_ALIGNMENT_DECISIONS.md#d3](https://github.com/poukai-inc/poukai-org-meta/blob/main/STACK_ALIGNMENT_DECISIONS.md) | `package.json`, `.github/renovate.json` |

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
| 37 | `[ ]` | React 19 ↔ DS dual-CT validation (D1): widen `@poukai-inc/ui` peer to `>=18 \|\| >=19`; CI matrix runs Playwright CT under React 18 + 19; bump `@types/react` + `@types/react-dom` to support both. See [STACK_ALIGNMENT_DECISIONS.md#d1](https://github.com/poukai-inc/poukai-org-meta/blob/main/STACK_ALIGNMENT_DECISIONS.md) | `package.json`, `poukai-ui` PR |
| 38 | `[ ]` | Bump `lucide-react` to latest 0.5xx across all three repos (D4); tighten `@poukai-inc/ui` peer floor to `>=0.500`; audit icon renames in lucide changelog between current versions and target. See [STACK_ALIGNMENT_DECISIONS.md#d4](https://github.com/poukai-inc/poukai-org-meta/blob/main/STACK_ALIGNMENT_DECISIONS.md) | `package.json`, `poukai-ui` PR |
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
| 121 | `[ ]` | **[D1+D6]** Consume next `@poukai-inc/ui` release with React 19 support — wait for lib release that adds R19 dual-peer (per #37), then bump `@poukai-inc/ui` to that version simultaneously with React 19 upgrade (autopost already on R19; this re-validates the pair end-to-end). See [STACK_ALIGNMENT_DECISIONS.md#d1](https://github.com/poukai-inc/poukai-org-meta/blob/main/STACK_ALIGNMENT_DECISIONS.md) | `package.json` |

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
| 104 | `[~]` | Fix remaining ESLint errors blocking lint CI gate. **Progress 2026-05-20**: 1462 → 156 errors via (a) console→logger migration (~660 calls across 85 files in lib/, app/, components/), (b) `eslint --fix` auto-fix for consistent-type-imports. Remaining 156: ~98 no-unused-vars (manual review), ~27 no-explicit-any (manual typing), ~15 react-hooks/immutability, ~13 @next/next/no-img-element, ~7 react/no-unescaped-entities. After zero: remove `continue-on-error` from CI lint job | repo-wide |
| 106 | `[ ]` | Tighten jsx-a11y beyond `next/core-web-vitals` baseline to full `recommended` set (R-024..R-033). Requires either forking next/core-web-vitals or registering jsx-a11y under an alias in eslint.config.mjs | `eslint.config.mjs` |
| 112 | `[ ]` | **[AUDIT-M1]** Block SQL injection vectors in `executeQuery` — `SELECT LOAD_FILE`, `INTO OUTFILE`, `INTO DUMPFILE`, `SLEEP(n)`, `BENCHMARK` all pass the `startsWith('SELECT')` guard. Fix: deny-list these patterns via regex pre-check; set `multipleStatements: false` in MySQL connection config | `lib/data-sources/database.ts:129-191` |
| 113 | `[ ]` | **[AUDIT-M3]** Upload MIME type bypass — `file.type` is client-supplied; `ext` derived from user-controlled `file.name` (path traversal risk). Fix: apply `path.basename()` before ext extraction; allowlist extensions; add magic-byte validation (first 8 bytes vs known signatures) | `app/api/upload/route.ts:40-54` |
| 114 | `[ ]` | **[AUDIT-M4]** Encrypt connection strings at rest — external DB credentials stored plaintext in MongoDB. Fix: AES-256-GCM encrypt with `ENCRYPTION_KEY` env var before saving; decrypt on read | `app/api/pages/[id]/data-sources/route.ts:137`, `lib/data-sources/database.ts` |
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
| 72 | `[ ]` | Rate limiting on `/api/generate`, `/api/blog/*`, `/api/upload` (Postgres advisory locks). **[AUDIT-M2]** Confirmed by 2026-05-20 security audit — zero rate limiting on all AI + upload endpoints; authenticated user can exhaust Groq quota or S3 storage | `app/api/**/route.ts` |

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
| 120 | `[ ]` | **[D3]** Track Auth.js v5 GA release; open migration ticket within 30–60d of GA. Migration ticket must include: regression tests for every OAuth provider (LinkedIn/Twitter/Facebook), session-cookie compatibility check. Prereq: #119 (exact pin). See [STACK_ALIGNMENT_DECISIONS.md#d3](https://github.com/poukai-inc/poukai-org-meta/blob/main/STACK_ALIGNMENT_DECISIONS.md) | `package.json`, `lib/auth.ts` |

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
| 115 | `[ ]` | **[AUDIT-L1]** ICP agent human-in-loop guard — AI quality scoring alone is insufficient guardrail against adversarial tweets; replies post with no human review. Add `requireHumanApproval` config (default `true`) that saves candidates to DB for dashboard review before posting | `lib/engagement/icp-engagement-agent.ts:338`, new dashboard review route |
| 116 | `[ ]` | **[AUDIT-L2]** Prompt injection in `improvePost` — user `instructions` param interpolated inline between quotes, no delimiters. Fix: wrap in `<INSTRUCTIONS>` XML tag; add system prompt note | `lib/openai.ts:265-272` |

---

## Snapshot by priority × severity

_Updated after 2026-05-20 security audit (+10 tasks: 107–116) and 2026-05-20 stack alignment (+5 tasks: 117–121, see [STACK_ALIGNMENT_DECISIONS.md](https://github.com/poukai-inc/poukai-org-meta/blob/main/STACK_ALIGNMENT_DECISIONS.md))._

|        | C  | H  | M  | L  | **Total** |
|--------|----|----|----|----|-----------|
| **P0** | 15 |  0 |  0 |  0 | **15** |
| **P1** |  0 | 43 | 13 |  0 | **56** |
| **P2** |  0 | 15 | 14 |  0 | **29** |
| **P3** |  0 |  0 |  0 | 20 | **20** |
| **Total** | **15** | **58** | **27** | **20** | **120** |

## Phase ↔ tasks map

| Phase | Tasks | Calendar |
|---|---|---|
| Phase 0 — Founder decisions | 1-7 | < 1 wk |
| Phase 1 — Operational hygiene + **security P0** + stack alignment | 8-12, 13-20, **107-109**, 117-119 | 1 wk |
| Phase 1 — Security hardening (H) | 110-111 | 1 wk (parallel with hygiene) |
| Phase 2 — Postgres + tenancy + notifications | 21-35 | 2-3 wks |
| Phase 3 — DS Path C | 36-50, 121 | 2-3 wks |
| Phase 4 — Distribution packaging | 58-67 | 1 wk |
| Phase 5 — Observability | 68-70 | 0.5 wk |
| Phase 6 — Tests + validation + cleanup | 71-85, 112-114 | 1-1.5 wks |
| Post-launch polish | 86-103, 115-116, 120 | rolling |

**Solo**: 7-9 wks. **Pair**: 5-6 wks.

## Working agreement

- Mark `[~]` when starting; `[x]` when merged to `main`; `[!]` when blocked (note blocker inline).
- Reference task ID in commit subject (`feat(p1-21): drizzle schema for Organization`).
- Reference task ID in PR title + body.
- Update [MIGRATION_ANALYSIS.md](MIGRATION_ANALYSIS.md) when scope changes; re-sync this file (`pnpm sync:backlog` if scripted later).
- Do not skip P0. Do not start Pn+1 before Pn is ≥80% drained except where parallel tracks are explicit (P1 has DB / notifications / UI as parallel).

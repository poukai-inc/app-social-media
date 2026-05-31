# Autopost — Migration Backlog

**Sources**:
- [MIGRATION_ANALYSIS.md](MIGRATION_ANALYSIS.md) v2.1 — multi-tenant SaaS + self-hostable rewrite
- [STACK_ALIGNMENT_DECISIONS.md](https://github.com/poukai-inc/poukai-org-meta/blob/main/STACK_ALIGNMENT_DECISIONS.md) (2026-05-20) — cross-repo stack alignment (D1–D7)

**Last sync**: 2026-05-29
**Total tasks**: 159 (17 C / 66 H / 45 M / 31 L)
**Latest audit**: 2026-05-29 full-repo audit (+38 tasks: 123–160; see "Audit additions" section)

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
| 122 | `[ ]` | **[CI-DEBT]** Revert `setTimeout(fn, 0)` fetch-in-useEffect wraps — 14 dashboard pages + `components/post-form.tsx` were hacked to silence `react-hooks/set-state-in-effect`. Microtask delay is benign but the pattern is misleading. Proper fix: introduce TanStack Query (or SWR) and move initial-fetches out of `useEffect`, OR adopt Suspense + `use(promise)` once R19 data-fetching pattern stabilizes. Introduced in commit `1b351e1`. | `app/dashboard/**/page.tsx`, `components/post-form.tsx` |

---

## Audit additions (2026-05-29)

Full-repo audit across security, correctness/concurrency, performance, and config/ops. New findings only — items already covered by tasks 1–122 were de-duplicated and excluded (e.g. cron-transport drift folded into #19, elk network into #85, dead deps into #15). File:line verified against current source. Sorted P0 → P3, severity C → L.

### P0-C — Critical (new)

| ID | Status | Task | File(s) |
|---|---|---|---|
| 123 | `[x]` | **[AUDIT2-C1]** OAuth secrets leak to client — `GET /api/pages` (and `GET /api/pages/[id]`) returns raw `Page` docs via `.lean()` with no projection; `connections[].accessToken`/`refreshToken`/`oauthToken`/`oauthTokenSecret` ship to the browser on every dashboard load (`Page` model has no `toJSON` transform stripping them). Fix: add `.select('-connections.accessToken -connections.refreshToken -connections.oauthToken -connections.oauthTokenSecret')` or a schema `toJSON` transform that deletes token fields; audit all routes returning raw `Page`. | `app/api/pages/route.ts:29,67`, `app/api/pages/[id]/route.ts`, `lib/models/Page.ts` |
| 124 | `[x]` | **[AUDIT2-C2]** Double-publish risk — `executePublish()` selects `status:'scheduled', scheduledFor:{$lte:now}` and only writes status back *after* the (serial, multi-minute, retry-backoff) network publish; `withLock('publish')` TTL is 300s and auto-expires mid-run, so an overlapping cron run re-reads the same still-`scheduled` posts and republishes to live platforms. Fix: atomically claim each post first — `Post.findOneAndUpdate({_id, status:'scheduled'}, {$set:{status:'publishing'}})` and proceed only if a doc returns; or `extendLock` periodically during long runs. | `app/api/cron/publish/route.ts:296-365` |

### P1-H — High (new)

| ID | Status | Task | File(s) |
|---|---|---|---|
| 125 | `[~]` | **[AUDIT2-H1]** Cross-tenant IDOR cluster — _(fix adds `lib/page-access.ts` ownership helper; also patches a 4th instance found mid-fix: `app/api/icp-engagement/route.ts` POST+GET, which had no separate task)_ — several routes resolve records by id with no page-ownership check: `conversations/[id]` GET (`ICPEngagement.findById`), `conversations` GET (`find({pageId})` on attacker-supplied `pageId`) + POST (`disableAutoResponse`/`updateOne` mutate any tenant's conversation), `pages/[id]/learning` GET (`Page.findById`). Any authenticated user reads/mutates another tenant's DMs, target-user PII, and analytics. Fix: resolve caller's pages and filter `findOne({_id, pageId:{$in:userPageIds}})` / `Page.findOne({_id, userId:user._id})`, else 404 (pattern already used by `pages/[id]` and `pages/[id]/posts`). | `app/api/conversations/[id]/route.ts:36`, `app/api/conversations/route.ts:50,133,137,144`, `app/api/pages/[id]/learning/route.ts:39` |
| 126 | `[~]` | **[AUDIT2-H2]** Unsafe lock release (TOCTOU) — `releaseLock` fallback does `findById` then `deleteOne({_id: lockId})` unconditionally; between the two calls a new holder can acquire, and the delete is not conditioned on `expiresAt`/`holder`, so a slow job whose lock TTL-expired deletes whatever valid lock now exists, breaking mutual exclusion (compounds #124). Fix: single atomic conditional delete `deleteOne({_id, holder:INSTANCE_ID})` and, for the expired path, `deleteOne({_id, expiresAt:{$lt:new Date()}})`. | `lib/distributed-lock.ts:160-178` |
| 127 | `[~]` | **[AUDIT2-H3]** Engage cron has no distributed lock — unlike publish/auto-generate, `cron/engage` calls no `withLock`; a slow run (3s+2s inter-item sleeps) overlapping the next invocation lets both pick up the same `pending`/`approved` rows and post duplicate LinkedIn comments/replies. Fix: wrap in `withLock('engage')` and atomically claim each `EngagementTarget`/`CommentReply` before acting. | `app/api/cron/engage/route.ts:74-296` |
| 128 | `[~]` | **[AUDIT2-H4]** Circuit breaker permanently corrupts shared config — on a 403 the instant-trip sets `this.entry.options.resetTimeoutMs = 3600000` on the process-wide cached breaker entry; the original (e.g. 15-min) timeout is lost forever, so every later failure for that key uses 1h even after the 403 clears. Fix: track the long reset in a local `openUntil` timestamp instead of mutating `options.resetTimeoutMs`. | `lib/circuit-breaker.ts:157` |
| 129 | `[~]` | **[AUDIT2-H5]** Scheduling ignores page timezone — `scheduledFor.setHours(hours,minutes,...)` uses the server's local tz and `getNextOccurrence` ignores its `_timezone` param (unused, underscore-prefixed). A page set to 09:00 local is scheduled at 09:00 server time. Fix: compute the target instant in `page.schedule.timezone`. | `app/api/cron/auto-generate/route.ts:52-69,410-415` |
| 130 | `[~]` | **[AUDIT2-H6]** Daily-usage limits are global, not per-tenant, and racy — `dailyUsageCache` is a module-global single object; `checkDailyLimits`/`incrementDailyUsage` mutate it with no page scoping or atomicity, and the DB aggregate counts *all* tenants' messages. The 50/day + $5/day caps are process-global (one tenant throttles everyone) with lost-update races. Fix: scope per page/user and back the counter with an atomic DB `$inc`. | `lib/engagement/conversation-manager.ts:267-354` |
| 131 | `[~]` | **[AUDIT2-H7]** `collect-metrics` cron is the heaviest path and partly broken — (a) `getPlatformAverages()` runs a full `EngagementHistory.aggregate` ($unwind+$group) once per platform per post inside a double loop (hundreds of full-history scans per run); (b) `Post.find({status:'published', publishedAt:{$gte:30d}}).populate('pageId')` is unbounded and global across tenants; (c) the aggregate `$match: {pageId}` compares a string (`page._id.toString()`) against an ObjectId field, matching 0 docs so historical baselines never apply and scoring silently falls back. Fix: precompute averages once per `(pageId,platform)` into a Map; cast `new mongoose.Types.ObjectId(pageId)`; add `.limit()`+`.lean()` and project only needed fields. | `app/api/cron/collect-metrics/route.ts:89-112,114,151-154,245` |
| 132 | `[~]` | **[AUDIT2-H8]** Live GitHub PAT on disk — `.env` holds a real-looking `NPM_TOKEN=ghp_…` referenced by `.npmrc` `_authToken`. `.env` is gitignored and not in history (verified), but a valid `ghp_` token sits in plaintext and in the Docker build context. Fix: rotate the PAT now at github.com/settings/tokens; inject `NPM_TOKEN` only via shell/CI secret; confirm `.env` never enters an image layer. | `.env:1`, `.npmrc:2`, `Dockerfile` |

### P1-M / P2-M — Medium (new)

| ID | Status | Task | File(s) |
|---|---|---|---|
| 133 | `[~]` | **[AUDIT2-M1]** Unauthenticated info disclosure — `GET /api/health?detailed=true` returns DB connection state, `NODE_ENV`, AI provider, and presence flags for `MONGODB_URI`/`NEXTAUTH_SECRET`/`LINKEDIN_CLIENT_ID`/`RESEND_API_KEY` to any anonymous caller. Fix: gate the `detailed` branch behind auth or `CRON_SECRET`; keep the plain `{status,timestamp,version}` body public. | `app/api/health/route.ts:6-53` |
| 134 | `[~]` | **[AUDIT2-M2]** Mass-assignment in post update — `PUT /api/posts/[id]` blindly copies `pageId`, `organizationId`, `targetPlatforms`, `postAs` from the body with no check the referenced `pageId`/`organizationId` belong to the caller; a user can reassign their post to another tenant's `pageId`, polluting that page's analytics/learning aggregates. Fix: validate `body.pageId`/`organizationId` against caller-owned records before assigning. | `app/api/posts/[id]/route.ts:103-112` |
| 135 | `[~]` | **[AUDIT2-M3]** IDOR (info leak) in `schedule/optimize` GET — when `pageId` is supplied, `Page.findById(pageId)` (no userId) leaks another tenant's connected-platform list. Fix: `Page.findOne({_id:pageId, userId:user._id})` (the POST handler at :236 already does this). | `app/api/schedule/optimize/route.ts:72` |
| 136 | `[ ]` | **[AUDIT2-M4]** Missing mongoose indexes for hot queries — add `Post.index({userId:1,status:1,publishedAt:-1})` (engage/replies/performance scans), `Post.index({pageId:1,status:1,createdAt:-1})` (auto-generate weekly count + status group), `EngagementTarget.index({status:1,scheduledFor:1,userId:1})` (engage distinct+scan), and optionally `ICPEngagement.index({pageId:1,platform:1,'conversation.autoResponseEnabled':1,'conversation.lastCheckedAt':-1})`. | `lib/models/Post.ts:471-478`, `lib/models/Engagement.ts:81-82`, `lib/models/ICPEngagement.ts` |
| 137 | `[ ]` | **[AUDIT2-M5]** Unbounded list queries — `GET /api/posts` (`find({userId}).sort().lean()`), `posts/pending`, and `engagements/debug` return every doc (full body, aiReview, platformResults, metricHistory) per tenant, growing without bound. Fix: add `limit`/`skip` pagination + `.select()` of list-view fields. | `app/api/posts/route.ts:29-31`, `app/api/posts/pending/route.ts:25`, `app/api/engagements/debug/route.ts:27` |
| 138 | `[ ]` | **[AUDIT2-M6]** Sequential N+1 in engage cron — per-user `User.findById`+`getOrCreateEngagementSettings`, then per published post `getPostComments`, then per comment `CommentReply.findOne({commentUrn})`, fully serial. Fix: batch settings via one `find({userId:{$in}})`; bulk-check comments with one `CommentReply.find({commentUrn:{$in:urns}})` per post (`commentUrn` is unique-indexed). | `app/api/cron/engage/route.ts:74-296` |
| 139 | `[ ]` | **[AUDIT2-M7]** Publish loop redundancy — unbounded `Post.find({status:'scheduled'...}).populate('userId')` then per-post `User.findById` (redundant — already populated) and `Page.findById`. Fix: use populated `post.userId`; batch `Page.find({_id:{$in:pageIds}})`; add `.limit()` to the scheduled scan. | `app/api/cron/publish/route.ts:296-321` |
| 140 | `[ ]` | **[AUDIT2-M8]** AI rate-limit cache races + dead increment — `recordUsage` does read-modify-write on module-global `dailyCache`/`minuteCache` across in-flight requests (lost updates → undercount → exceed Groq limits); line 197 `rateLimitHits: cached.rateLimitHits + (success ? 0 : 0)` always adds 0, so error counts never accrue. Fix: increment by `success ? 0 : 1`, treat cache as advisory, rely on atomic DB `$inc` for correctness. | `lib/ai-client.ts:162-198` |
| 141 | `[ ]` | **[AUDIT2-M9]** Non-idempotent conversation reply — `lastCheckedAt` is bumped (and messages pushed) in separate non-transactional writes, and `currentAutoResponseCount` increments after `replyToTweet` succeeds in a separate write; a crash between them sends a reply that isn't counted, so the 3-per-conversation cap can be exceeded next run. Fix: record outgoing message + count increment atomically; dedupe on `replyResult.replyId`. | `lib/engagement/conversation-manager.ts:920-1061` |
| 142 | `[ ]` | **[AUDIT2-M10]** Wrong-connection token update — publish-route token-refresh save matches only `'connections.platform': platform`, so a page with two connections of the same platform updates the first array element regardless of which expired (token-refresh route correctly also matches `platformId`). Fix: include `platformId` in the publish-route positional filter. | `app/api/cron/publish/route.ts:96-105` |
| 143 | `[ ]` | **[AUDIT2-M11]** NaN in shares metric — `shares: metrics.retweet_count + (metrics.quote_count || 0)`; `retweet_count` is not defaulted, so an absent value yields `NaN` that propagates into engagement-rate math. Fix: `(metrics.retweet_count || 0) + (metrics.quote_count || 0)`. | `lib/platforms/twitter-adapter.ts:396` |
| 144 | `[ ]` | **[AUDIT2-M12]** Misleading metric + O(n²) in icp-engage — `repliesSent: agentResult.repliesSuccessful` hides failed-but-attempted replies, and `pages.indexOf(page)` re-scans the array each iteration. Fix: report sent vs successful distinctly; use the loop index. | `app/api/cron/icp-engage/route.ts:101,106` |
| 145 | `[ ]` | **[AUDIT2-M13]** Facebook access token in URL query — metrics fetch interpolates the access token into the URL query string, landing it in any proxy/access logs. Fix: use header auth or POST body. | `lib/platforms/facebook-adapter.ts:225` |
| 146 | `[ ]` | **[AUDIT2-M14]** `CRON_SECRET` persisted to world-readable env file — `entrypoint.sh` writes it to `/etc/scheduler.env` in plaintext, inherited by every cron child (visible via `/proc/<pid>/environ`). Fix: read from a mounted secret file at call time; `chmod 600`. (distinct from #8 query→header.) | `scheduler/entrypoint.sh:13-15`, `scheduler/cron-call.sh:19` |
| 147 | `[ ]` | **[AUDIT2-M15]** No image HEALTHCHECK — compose defines a healthcheck but the image has none, and `depends_on: app` (plain) waits only for start, not health, so the scheduler can fire against an unready app. Fix: add `HEALTHCHECK` to `Dockerfile`; use `depends_on: condition: service_healthy`. | `Dockerfile`, `docker-compose.yml:37-61` |
| 148 | `[ ]` | **[AUDIT2-M16]** Scheduler image unpinned + redundant curl — `FROM alpine:latest` breaks reproducibility; curl is installed at build (`Dockerfile:3`) and again at runtime (`entrypoint.sh:4`, dead). Fix: pin `alpine:3.x`; drop the runtime `apk add curl`. | `scheduler/Dockerfile:1`, `scheduler/entrypoint.sh:4` |
| 149 | `[ ]` | **[AUDIT2-M17]** No app-router error/loading boundaries — repo has no `error.tsx`, `global-error.tsx`, `loading.tsx`, or `not-found.tsx` anywhere; any unhandled render/fetch error in a Server Component shows the bare Next.js default screen with no recovery, and async segments have no Suspense fallback. Fix: add `app/error.tsx` + `app/global-error.tsx` + `app/dashboard/loading.tsx` at minimum. | `app/**` |
| 150 | `[ ]` | **[AUDIT2-M18]** 34 tracked one-off debug/fixer scripts — `scripts/` holds ad-hoc fixers (`fix-failed-post.mjs`, `fix-datasource.mjs`, `reset-post.cjs`), diagnostics, and `test-*.mjs` harnesses that reimplement `lib/` generation flow; all exempt from no-console and unwired to any runner. Fix: move keep-worthy diagnostics to `tools/` with a README, delete superseded fixers, replace `test-*` harnesses with real Vitest/Playwright tests (ties to #117). | `scripts/*` |

### P3-L — Low (new)

| ID | Status | Task | File(s) |
|---|---|---|---|
| 151 | `[ ]` | **[AUDIT2-L1]** CSS-injection sink — `dangerouslySetInnerHTML` interpolates `--brand-primary:${BRAND_PRIMARY}` into a `<style>`. Source is a server env var (not exploitable now) but becomes an injection sink if `BRAND_PRIMARY` ever turns tenant-configurable. Fix: validate against a hex/CSS-color regex before interpolation. | `app/layout.tsx:30` |
| 152 | `[ ]` | **[AUDIT2-L2]** `postcss` moderate advisory GHSA-qx2v-qp2m-jg93 (XSS via unescaped `</style>`) — build-time tooling only, no runtime exposure. Bump on next maintenance pass. | `package.json` |
| 153 | `[~]` | **[AUDIT2-L3]** Error-message leak — `pages/[id]/learning` returns raw `error.message` to the client; every other route returns a generic string. Fix: return a generic message, log detail server-side. | `app/api/pages/[id]/learning/route.ts:115` |
| 154 | `[ ]` | **[AUDIT2-L4]** Retry backoff array/`MAX_RETRIES` misalignment — `RETRY_DELAY_MS` has 3 entries but the guard/recursion never delays a 4th attempt by a real slot; worst-case serial retry time (≈50s/platform) is what blows past the 300s lock TTL in #124. Fix: align `MAX_RETRIES` with the delay-array length; document worst-case runtime vs lock TTL. | `app/api/cron/publish/route.ts:20,175` |
| 155 | `[ ]` | **[AUDIT2-L5]** In-memory aggregation in `schedule/optimize` — loads up to 500 full posts then buckets/sorts in JS. Fix: push day/hour/platform aggregation into a MongoDB `$group` pipeline or cache. | `app/api/schedule/optimize/route.ts:59-117` |
| 156 | `[ ]` | **[AUDIT2-L6]** Wasted query — `GET /api/ai/usage` awaits `getUsageStatus()` then discards the result; the three usage helpers each re-read today's `AIUsage`. Fix: drop the unused call; share one usage snapshot. | `app/api/ai/usage/route.ts:33-35` |
| 157 | `[ ]` | **[AUDIT2-L7]** README inaccuracies — says "Next.js 15" (actual `next@16.2.6`), AI "Groq" (actual default `AI_PROVIDER=ollama`, Groq optional), and `npm install && npm run dev` (repo is pnpm-pinned `packageManager: pnpm@10.33.0`). Fix: correct version, provider, and package-manager commands. | `README.md:48,51,93,112-113` |
| 158 | `[ ]` | **[AUDIT2-L8]** No container resource limits — long-running auto-poster + ffmpeg video processing can balloon memory and OOM the host. Fix: add `mem_limit`/`cpus` (or `deploy.resources`) to the `app` service. | `docker-compose.yml` |
| 159 | `[ ]` | **[AUDIT2-L9]** `allowJs: true` unnecessary for an all-TS app; loosens the build surface for the 34 root `.mjs`/`.cjs` scripts. Fix: drop `allowJs` unless a JS source is genuinely imported. | `tsconfig.json:6` |
| 160 | `[ ]` | **[AUDIT2-L10]** Large planning docs at repo root — `MIGRATION_ANALYSIS.md` (~49KB) + `BACKLOG.md` (~24KB) clutter root. Fix: move to `docs/` (update cross-links). | repo root |

---

## Snapshot by priority × severity

_Updated after 2026-05-20 security audit (+10 tasks: 107–116), 2026-05-20 stack alignment (+5 tasks: 117–121, see [STACK_ALIGNMENT_DECISIONS.md](https://github.com/poukai-inc/poukai-org-meta/blob/main/STACK_ALIGNMENT_DECISIONS.md)), 2026-05-21 CI-greening (+1 task: 122), and 2026-05-29 full-repo audit (+38 tasks: 123–160)._

|        | C  | H  | M  | L  | **Total** |
|--------|----|----|----|----|-----------|
| **P0** | 17 |  0 |  0 |  0 | **17** |
| **P1** |  0 | 51 | 31 |  0 | **82** |
| **P2** |  0 | 15 | 14 |  0 | **29** |
| **P3** |  0 |  0 |  0 | 31 | **31** |
| **Total** | **17** | **66** | **45** | **31** | **159** |

_2026-05-29 audit split: P0-C +2 (123–124); P1-H +8 (125–132); P1/P2-M +18 (133–150); P3-L +10 (151–160)._

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
| Post-launch polish | 86-103, 115-116, 120, 122 | rolling |

**Solo**: 7-9 wks. **Pair**: 5-6 wks.

## Working agreement

- Mark `[~]` when starting; `[x]` when merged to `main`; `[!]` when blocked (note blocker inline).
- Reference task ID in commit subject (`feat(p1-21): drizzle schema for Organization`).
- Reference task ID in PR title + body.
- Update [MIGRATION_ANALYSIS.md](MIGRATION_ANALYSIS.md) when scope changes; re-sync this file (`pnpm sync:backlog` if scripted later).
- Do not skip P0. Do not start Pn+1 before Pn is ≥80% drained except where parallel tracks are explicit (P1 has DB / notifications / UI as parallel).

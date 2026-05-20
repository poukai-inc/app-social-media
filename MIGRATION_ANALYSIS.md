# Autopost → Poukai Infrastructure Migration Analysis (v2)

**Date**: 2026-05-20
**Author**: Engineering review
**Version**: v2.1 — stack locked (Drizzle, Neon+R2+Vercel+Resend+Hetzner, UI Path C, notifications abstraction)
**Scope**: Full codebase audit + product-aware migration plan + prioritized backlog
**Targets**:
  - (a) Hosted Poukai SaaS for clients
  - (b) Self-hosted single-tenant install on client infrastructure
**Source-of-truth standards**: `poukai/meta/standards/technical-requirements.md` (R-001…R-082), `poukai/meta/masterplan.md`, `@poukai-inc/ui` v0.18.0

---

## 0. Direction shift vs v1

v1 of this doc treated the migration as **operational hygiene + DS adoption**. v2 widens the goal to **productizing autopost as a deployable artifact** — multi-tenant in the cloud, single-tenant in a client's VPC, same codebase, same release cadence. That changes three things:

| Concern | v1 stance | v2 stance |
|---|---|---|
| Data layer | Keep MongoDB; harden connection | **Postgres 16 + Drizzle ORM + S3-compat storage** (locked, see §3); replaces Mongo + native session storage; no Supabase, no Prisma |
| Tenancy | Implicit single-tenant | **Org-scoped multi-tenancy** with row-level security; same code runs as N=1 in self-host or N=many in SaaS |
| Distribution | Vercel + container scheduler | **Two artifacts**: (1) Vercel deploy of hosted SaaS; (2) `docker compose up` install bundle (app + Postgres + MinIO + scheduler) for client servers |
| Hosting (SaaS) | Implicit Vercel + MinIO | **Neon (Postgres) + Cloudflare R2 (object) + Vercel (compute) + Resend (email) + Hetzner CPX11 (Matomo/Bugsink)**; not AWS — see §5.1 |
| Branding | Use `@poukai-inc/ui` as-is | **Token-overridable white-label** via env-driven CSS custom properties; DS PR needed for `Wordmark` `src` prop |
| UI shape | DS covers everything | **DS is marketing-shaped, not app-shaped**; Path C hybrid — DS for chrome/brand atoms, build app-local primitives on Radix + DS tokens (see §3a/§8 Phase 3) |
| Notifications | Email only (Resend) | **Pluggable channel abstraction**: email + Slack/Discord webhook + in-app feed + Telegram; self-host defaults to Slack webhook (zero SMTP setup) |
| Licensing | Not addressed | **Locked**: Poukai Internal-Use License v1.0 (PIUL-1.0) for both autopost and `@poukai-inc/ui` — source-available, customer-only, no public OSS posture. See `decisions/0001-licensing.md`. **Template pending counsel review.** |

The v1 §6 backlog is preserved; v2 reorders priorities and adds new P0/P1 tasks (see §9). v1 work is not wasted — operational hygiene still goes first because it unblocks everything downstream.

---

## 1. Executive summary

`autopost` is functionally rich (~50 API routes, 7 crons, 9 Mongo models, 4 platform adapters, Ollama+Groq rotation engine, NextAuth v5, S3/MinIO storage). It is not yet a *product* — it has implicit single-tenancy, hardcoded brand identity, no install bundle, undocumented data contract, and operational drift (cron transport unclear, secrets in URL params, placeholder secrets in Dockerfile, hardcoded private IP).

To meet the v2 goal (hosted SaaS + self-hostable for clients):

1. **Consolidate the data layer to Postgres 16 + Drizzle ORM + S3-compat storage** — MinIO bundled for self-host; Cloudflare R2 for hosted SaaS. Drop Mongo + mongoose entirely. No Supabase, no Prisma (rationale §3.2).
2. **Bake multi-tenancy in from the start** — `Organization` is the new root entity above `User`; every row carries `org_id`; Postgres RLS enforces isolation; N=1 install just creates one org on first boot.
3. **Adopt `@poukai-inc/ui` (Path C hybrid)** for chrome + brand atoms; build app-local primitives (Input, Select, Tabs, DropdownMenu, Table, Toast) on Radix + DS tokens — DS is marketing-shaped, autopost is app-shaped (see §3a).
4. **Notification abstraction** — email (Resend) is one channel among many; ship with Slack/Discord webhook + in-app feed adapters so self-host installs need zero SMTP setup.
5. **Ship two artifacts**: a Vercel deploy (hosted SaaS, Neon + R2) and a `docker-compose.bundle.yml` (self-host, bundled Postgres + MinIO). Same image, same migrations, different orchestration.
6. **Pick a license** for both `autopost` and `@poukai-inc/ui` before any client install ships.
7. **All of v1's operational hygiene** (pnpm, Node pin, CI, lint, no `console.*`, security headers, secret-in-header not query) is prerequisite to the above.

**Phases**: 6 phases, ~7-9 weeks single engineer, ~5-6 weeks with two (Phase 3 UI revised from 1-1.5 → 2-3 wks; see §8).

**Severity inventory (v2.1)**: 7 CRITICAL, 22 HIGH, 28 MEDIUM, 17 LOW.

---

## 2. Current state — autopost (unchanged from v1, summarized)

### 2.1 Stack snapshot

| Layer | Current | Notes |
|---|---|---|
| Framework | Next.js 16.1.3 (App Router) | Keep |
| React | 19.2.3 | DS peerDep `>=18`; verify Radix compat |
| Pkg mgr | npm | → pnpm 10 (R-003) |
| Node | unpinned | → `>=20 <21` (R-004) |
| Styling | Tailwind 4 | Keep for layout; DS owns atoms |
| DB | **MongoDB** (mongoose 9, 9 models, 2,216 lines schema) | **→ Postgres** (see §3) |
| Auth | NextAuth v5 beta (LinkedIn only) | Keep handler, swap adapter to Postgres |
| AI | OpenAI SDK → Ollama or Groq | Keep; harden hardcoded IP |
| Storage | S3-compatible (MinIO) | Keep; tenant-prefix keys |
| Email | Resend | Keep; per-org sender domain later |

### 2.2 Code surface

50 API routes, 7 cron endpoints, 18 dashboard pages, 13 components. Detailed inventory in v1; not repeated.

### 2.3 Top operational defects (security-critical)

1. `CRON_SECRET` in URL query (`scheduler/cron-call.sh:21`) — leaks in proxy/access logs.
2. Hardcoded private IP `192.168.1.9:11434` (`lib/ai-client.ts:36`).
3. Placeholder secrets baked into Docker build env (`Dockerfile:18-31`).
4. Dual cron transports (Vercel `vercel.json` + Alpine `scheduler/`) disagree on job set.
5. No security headers in `vercel.json` (R-042-R-045 HARD).
6. `O_API_KEY` vs `OPENAI_API_KEY` env naming drift in `docker-compose.yml`.
7. No input validation library (no Zod) at API boundaries.
8. No rate limiting on token-burning routes (`/api/generate`, `/api/blog/*`).
9. `console.*` ~25 calls in `ai-client.ts` alone (R-073).
10. Tracked backup file `lib/platforms/twitter-adapter.ts.backup`.
11. ~~Dead deps `mysql2`, `dotenv`~~. **CORRECTION (2026-05-20)**: both are alive. `mysql2` is used in `lib/data-sources/database.ts` (external-DB connector for sourcing post material from client MySQL); `dotenv` is used in 20 `scripts/*.mjs|.cjs` utilities/migrations. Keep both; document MySQL data-source purpose; consider migrating scripts to Node 20 `--env-file` later.

---

## 3. Data layer consolidation — MongoDB → Postgres

### 3.1 Why move

| Driver | MongoDB | Postgres |
|---|---|---|
| Self-host UX | Mongo replica-set setup is non-trivial; license is SSPL (not OSI-approved); friction for client ops | Postgres is universally understood; PG-compat extensions ubiquitous; standard backup tooling |
| Multi-tenant isolation | App-level only (`org_id` checks scattered in queries) | **Row-Level Security policies** enforced by DB; queries can't accidentally leak across tenants |
| Storage co-location | Separate MinIO container | Stay separate with MinIO (bundled in self-host compose); R2 for hosted |
| Auth co-location | NextAuth has its own collections in Mongo | NextAuth `@auth/drizzle-adapter` |
| ACID for cron | Mongo transactions require replica set | Native ACID; cron `publish` job's idempotency primitives become trivial |
| Schema migration tooling | Mongoose has no migration story | Drizzle Kit — plain SQL files, reviewable, no codegen step |
| Licensing | SSPL (problematic for some clients) | PostgreSQL License (BSD-style, no encumbrance) |

### 3.2 Recommended target — LOCKED

**Postgres 16 + Drizzle ORM + S3-compat storage (MinIO bundled for self-host, Cloudflare R2 for hosted SaaS)**.

**Why Drizzle over Prisma**:

| | Drizzle | Prisma |
|---|---|---|
| Runtime | ~10 KB TS, no engine binary | ~13 MB engine binary per arch (bloats Docker image, breaks on Alpine arm64) |
| Cold start | ~50 ms | ~400 ms |
| RLS support | Native `sql\`SET LOCAL app.current_org_id = ${orgId}\`` | Awkward — needs `$queryRaw` for `set_config()` |
| SQL transparency | SQL-like API, leaks no abstractions | DSL hides SQL; hard to optimize |
| Migrations | `drizzle-kit generate` → plain reviewable SQL files | Opaque + shadow DB |
| TS inference | First-class, zero codegen | Codegen required after every schema change |
| Self-host friction | None | Engine binary per platform = image bloat + arch matrix |

Drizzle wins on self-host UX, RLS ergonomics (the load-bearing security feature), and transparency (clients can audit SQL migrations before applying upgrades).

**Why NOT Supabase**: duplicates NextAuth (`gotrue`), adds storage container vs already-bundled MinIO, bloats self-host with unused realtime/edge-functions, locks pricing on hosted side. PostgREST competes with Next.js API routes. Plain Postgres is leaner.

**Why NOT AWS RDS**: ~$80/mo Multi-AZ minimum vs Neon Pro $19/mo (autoscale, branching, PITR); higher ops surface (VPC, IAM, security groups, NAT gateway $32/mo). Migrates cleanly later if needed (just `pg_dump` → restore).

**Reject also**: PlanetScale (MySQL, vendor lock), CockroachDB (multi-region overkill, AGPL), DynamoDB (vendor lock, no RLS), SQLite/Turso (deferred to future "lite" tier; concurrent writes weak for multi-tenant SaaS), staying on Mongo (loses RLS + license clarity).

### 3.3 Migration shape

1. Define Drizzle schema (`db/schema.ts`) mirroring the 9 mongoose models (`User`, `Organization` [NEW], `OrganizationMember` [NEW], `Page`, `Post`, `Engagement`, `EngagementHistory`, `ICPEngagement`, `AIUsage`, `TokenAlert`, `CommentSuggestion`).
2. Add `organization_id` FK (uuid) on every tenant-scoped table.
3. Write RLS policies as plain SQL migrations: `USING (current_setting('app.current_org_id')::uuid = organization_id)`.
4. Build a one-shot Mongo→Postgres migration script (`scripts/migrate-mongo-to-postgres.ts`) — read every collection, transform, batch-insert. Idempotent; tracks high-water-mark per collection.
5. Run dual-write window (write Mongo + Postgres, read Mongo) → read switchover (read Postgres, write both) → Mongo decommission. ~2 weeks of dual-write in production.
6. Delete `lib/mongodb.ts`, `mongoose` dep, all `lib/models/*.ts`. Replace with `db/` directory (Drizzle schema + queries).

### 3.4 Cost

| Item | LoC change | Calendar |
|---|---|---|
| Drizzle schema + migrations | +500 | 2 days |
| Repository layer rewrite (queries) | ~1,500 churn across `lib/` and `app/api/` | 5-7 days |
| Migration script | +400 | 2 days |
| Dual-write + cutover | infra-only | 2 weeks elapsed (low eng effort, mostly observation) |
| RLS policies + isolation tests | +200 | 2 days |
| **Total active eng time** | | **~2 weeks** |

---

## 3a. UI shape — Path C hybrid (revised from §8 Phase 3)

DS catalog (`@poukai-inc/ui@0.18.0`, 24 components) is built for the **pouk.ai marketing site**. Autopost is an **app**. Mismatch is structural — DS ships editorial atoms (`Hero`, `Principle`, `FailureMode`, `Portrait`, `Pull`, `Statement`); autopost needs form atoms (Input, Select, Textarea, Checkbox), data-display (Table, EmptyState, Toast, Skeleton), and dashboard organisms (AppShell with sidebar, DataTable, CommandPalette).

**Weighted DS coverage of existing 11,700 LoC UI: ~32%.** Two-thirds stays bespoke.

### 3a.1 Three paths considered

- **Path A** — grow DS into dashboard DS (15-20 new atoms, 5 molecules, 1-2 organisms). 2-3 wks DS work before app rewrite starts; total Phase 3 = 4-5 wks. Needs DS owner approval.
- **Path B** — keep DS marketing-only; build separate `autopost-ui` primitives. ~1.5-2 wks. Two DSs to maintain long-term.
- **Path C (chosen)** — hybrid. DS for chrome + brand atoms (`SiteShell`-derived `AppShell`, `Wordmark`, `Button`, `StatusBadge`, `Tag`, `Avatar`, `Eyebrow`, `Dialog`, `Quote`, `FeatureCard` where shape fits). Build app-local primitives in `components/ui/` on top of Radix (already DS transitive dep) + DS tokens.css. Source from shadcn/ui patterns (same Radix base, retheme via tokens). Phase 3 = **2-3 wks**.

### 3a.2 App-local primitives to build

**Atoms** (~15 thin wrappers, ~80 LoC each): `Input`, `Textarea`, `Select`, `Combobox`, `Checkbox`, `RadioGroup`, `Switch`, `Label`, `HelperText`, `ErrorMessage`, `Spinner`, `Skeleton`, `Toast`, `Tooltip`, `ProgressBar`.

**Molecules**: `FormField` (label + input + helper + error), `DropdownMenu`, `Tabs`, `Pagination`, `EmptyState`, `Breadcrumb`, `DatePicker`, `TimePicker`, `FileUploader` (drag-drop).

**Organisms**: `AppShell` (sidebar + topbar + content slot), `DataTable` (sort/filter/page).

Net LoC: **~1,200 new primitive LoC** replaces **~5,000 LoC of duplicated Tailwind class soup** across components → net negative.

### 3a.3 Other UI blockers

- **Dark mode** — autopost uses `dark:*` Tailwind extensively; DS tokens.css ships no dark theme. Pick: (a) build dark token override, (b) drop dark mode for now, (c) push dark theme to DS. **Decide before Phase 3.**
- **`lucide-react` version drift** — autopost `^0.562.0` vs DS peer `^0.400.0`. Pin to `>=0.400.0 <0.600.0`.
- **Hardcoded brand color `bg-blue-600`** in navbar wordmark (`navbar.tsx:57`) collides with white-label. Token-ize.
- **Inline platform SVGs** in `post-card.tsx` (~80 LoC × 4 brand glyphs) — extract to `components/icons/platforms/`; candidate for DS if Poukai will publish multi-platform apps.

---

## 4. Multi-tenancy model

### 4.1 Tenancy contract

- **Tenant root entity**: `Organization`. Every row in every other table FKs (directly or transitively) to `organization_id`.
- **User-org relationship**: many-to-many via `OrganizationMember(user_id, organization_id, role)` where `role ∈ {owner, admin, member}`.
- **`Page` is org-scoped**, not user-scoped. (Currently `Page` is implicitly user-scoped via `User`'s `linkedinAccessToken` — needs unwinding.)
- **OAuth credentials are org-scoped**: each org provides its own LinkedIn/Twitter/Facebook app IDs (BYO OAuth), or the hosted SaaS provides a shared app and self-host requires BYO.
- **AI usage tracking is org-scoped**: `AIUsage` gets `organization_id`; quotas/billing roll up per org.
- **S3 storage is prefixed**: `s3://bucket/org_<uuid>/page_<uuid>/<filename>` — prevents cross-tenant key guessing.

### 4.2 Single-tenant install special case

Self-host runs N=1 organization. The same code path applies — first-boot wizard creates Org #1 and an owner user. Multi-tenancy code never branches on "is this hosted or self-hosted"; it just sees `count(organizations) == 1`.

### 4.3 Isolation enforcement

Three layers, defense in depth:

1. **Application layer**: every Drizzle query in repository functions takes `orgId` as a required first arg; per-request middleware sets `SET LOCAL app.current_org_id = <uuid>` inside a transaction.
2. **Database layer**: Postgres RLS policies on every tenant table using `current_setting('app.current_org_id')::uuid`.
3. **Storage layer**: S3/R2 key prefixes + IAM policy (hosted) / MinIO bucket policy (self-host) scoped to org prefix.

### 4.4 Cross-tenant concerns

- **AI provider key**: shared in hosted SaaS (Poukai pays Groq); BYO in self-host (client provides Ollama/Groq).
- **Cron jobs**: run org-by-org loops; one slow tenant must not block others (per-org timeout, parallelization budget).
- **Notifications**: pluggable channel per org via `notification_channels: jsonb` on `Organization`. Email needs per-org Resend domain verification (defer to v2.1); Slack/Discord webhook works out-of-box.

---

## 5. Distribution — two artifacts, one codebase

### 5.1 Hosted SaaS (`pouk.ai/autopost` or `app.pouk.ai`) — LOCKED stack

| Layer | Pick | Why |
|---|---|---|
| Compute | **Vercel Pro** ($20/mo) | Native Next.js target, edge cache, preview deploys per PR, SOC2 |
| DB | **Neon Pro** ($19/mo) | Serverless Postgres, autoscale, branching per PR, PITR, SOC2 |
| Object storage | **Cloudflare R2** (~$5/mo) | S3-compat (zero code change), **$0 egress fees** (kills #1 AWS bill killer for media-heavy apps) |
| Email | **Resend Pro** ($20/mo) | React Email components, ex-Vercel team, good deliverability; free tier covers MVP |
| DNS | **Cloudflare DNS** ($0) | Free, fast, integrates with R2 |
| Observability | **Bugsink + Matomo** self-hosted on **Hetzner CPX11** (€4.50/mo) | Already Poukai-locked (R-060/R-061); cheap dedicated box; no per-event pricing |
| Auth | NextAuth (LinkedIn) + `@auth/drizzle-adapter` | Same code as self-host |
| Crons | `vercel.json` crons → `/api/cron/*` with `Authorization: Bearer ${CRON_SECRET}` | Native Vercel transport |
| Billing | Stripe (later) | Per-org plan tier gates feature flags |
| Branding | Locked to Poukai brand via `@poukai-inc/ui` defaults | White-label only for self-host |

**Hosted SaaS total**: ~$70-100/mo for Growth tier (10-100 tenants). **~$6/mo MVP tier** (free Neon + Vercel Hobby + R2 + Resend free + Hetzner).

**Why NOT AWS**: ~$250-350/mo for equivalent shape (RDS Multi-AZ $80, S3+CloudFront $30+, ECS/ALB/NAT $90+, SES, CloudWatch $40, Secrets Manager $5, Route 53 $2). 3-4× more expensive + ~2 wks infra-eng tax (VPC, IAM, security groups). All picks above migrate cleanly to AWS later if needed (no lock-in).

### 5.2 Self-host bundle (`autopost-selfhost.tar.gz`)

Ship as a versioned tarball or GHCR-published OCI image bundle:

```
autopost-selfhost/
├── docker-compose.yml          # app + postgres + minio + scheduler (+ matomo/bugsink optional)
├── .env.example                # documented every env var, every secret
├── caddy/Caddyfile             # reverse proxy + automatic TLS
├── scripts/
│   ├── install.sh              # one-shot install: pull images, migrate, seed
│   ├── upgrade.sh              # bump version, run migrations, restart
│   ├── backup.sh               # pg_dump + minio snapshot
│   └── restore.sh
├── docs/
│   ├── install.md
│   ├── upgrade.md
│   ├── byo-oauth.md            # how to wire client's own LinkedIn/Twitter/Facebook apps
│   ├── byo-ai.md               # Ollama vs Groq vs OpenAI
│   └── security.md
└── LICENSE                     # decided per §7
```

- **Crons**: Alpine `scheduler` container (Vercel cron syntax doesn't apply); secret via `Authorization` header.
- **DB**: bundled `postgres:16-alpine` container; ~80 MB image, starts in <2s.
- **Storage**: bundled `minio` container.
- **Notifications**: defaults to Slack/Discord webhook (paste URL into `.env`); SMTP optional via Resend or any other provider.
- **Observability**: optional `bugsink` + `matomo` containers, profile-gated in compose.
- **Updates**: clients run `./scripts/upgrade.sh v1.2.3`; pulls new image, runs `drizzle-kit migrate`, restarts.
- **Backups**: clients responsible; we ship `./scripts/backup.sh` (`pg_dump` + minio snapshot).

### 5.3 Build/release pipeline

- Single `Dockerfile` builds the app image (same as today, hardened).
- CI on tag (`v*.*.*`):
  - Publish image to GHCR (`ghcr.io/poukai-inc/autopost:v*`).
  - Bundle `autopost-selfhost.tar.gz` (compose + scripts + docs) and attach to GitHub release.
  - Hosted SaaS: Vercel auto-deploys `main`.
- Changesets-based versioning (matches `poukai-ui`).

---

## 6. White-label / branding

### 6.1 Token override contract

`@poukai-inc/ui/tokens.css` declares CSS custom properties (`--brand-primary`, `--brand-fg`, etc.). Self-host install can override via:

```css
/* app/brand-override.css — gitignored, env-templated at boot */
:root {
  --brand-primary: var(--client-primary, #0071E3);
  --brand-wordmark-fill: var(--client-wordmark, #1D1D1F);
}
```

Driven by env: `BRAND_PRIMARY`, `BRAND_WORDMARK_URL`, `BRAND_NAME`, `BRAND_FAVICON_URL`. `app/layout.tsx` injects them into a `<style>` tag (or templates `brand-override.css` at build time).

### 6.2 Wordmark replacement

DS `Wordmark` atom is Poukai-hardcoded. Two options:

- **(a)** DS ships a `Wordmark` variant that accepts an SVG `src` prop (preferred — keeps brand contract; needs a DS PR).
- **(b)** Self-host overrides with a `BrandWordmark` shim in the app repo.

Choose (a); raise a changeset in `poukai-ui` to add `Wordmark` `src` prop.

### 6.3 Boundary

Self-host can override tokens, logo, favicon, email-from. Self-host **cannot** modify component layout (shape stays Poukai); they get the substance dial only. If a client wants different shape, that's a fork conversation, not a config.

---

## 6a. Notifications — pluggable channel abstraction

Email is **needed** for current product (approval workflow, token-expiry alerts, auto-approval FYI — all hit `lib/email.ts`). But email-as-only-channel is wrong for self-host (clients must provision SMTP/Resend, configure SPF/DKIM/DMARC, deal with deliverability).

### 6a.1 Current usage (audit)

Three call sites today:
1. `app/api/blog/generate/route.ts` + `app/api/cron/auto-generate/route.ts` — `sendApprovalEmail()` for high-risk AI-generated posts; 48h token-expiring Approve/Edit/Reject links.
2. `app/api/cron/token-refresh/route.ts:197` — OAuth token-expiry warnings (LinkedIn/Twitter/Facebook).
3. `lib/email.ts:253` — `sendAutoApprovalNotification()` for low-risk auto-published posts.

### 6a.2 Defects in current shape

- `lib/email.ts:14` defaults `EMAIL_FROM` to `noreply@schedular.primestrides.com` — **leaks unrelated domain into autopost installs**; must be env-required, no default.
- Approval links bake `NEXTAUTH_URL` into email body — LAN-only self-host installs break when emails are opened off-network.
- Email failure silently rejects approval flow (no retry, no fallback channel).

### 6a.3 Target abstraction

`lib/notifications/` with channel adapters:

```
lib/notifications/
├── index.ts           # notify(orgId, event, payload) — dispatches to org's configured channels
├── channels/
│   ├── email.ts       # Resend (or any SMTP via nodemailer)
│   ├── slack.ts       # incoming webhook
│   ├── discord.ts     # incoming webhook
│   ├── telegram.ts    # bot token + chat_id
│   └── inapp.ts       # DB-backed notification feed (dashboard bell)
├── events/
│   ├── post-approval-request.ts   # renders per-channel template
│   ├── post-auto-approved.ts
│   └── token-expiring.ts
└── types.ts
```

Per-org config in `Organization.notification_channels: jsonb`:

```jsonc
{
  "post-approval-request": ["email", "slack"],
  "token-expiring": ["slack", "inapp"],
  "post-auto-approved": ["inapp"]
}
```

### 6a.4 Deployment defaults

| Tier | Default channels |
|---|---|
| Hosted SaaS MVP | Email (Resend free) + In-app feed |
| Hosted SaaS Growth | Email (Resend Pro) + In-app + optional Slack/Discord per org |
| Self-host (no SMTP) | In-app feed + Slack webhook (paste URL into `.env`) — **zero SMTP setup** |
| Self-host (with SMTP) | All channels available |

---

## 7. Licensing

### 7.1 Forced decision

Distributing autopost to client servers requires an explicit license. Options:

| License | Permits client install? | Permits client modifying? | Permits client reselling? | Recommended for |
|---|---|---|---|---|
| MIT / Apache-2.0 | Yes | Yes | Yes | OSS posture, no commercial moat |
| BSL 1.1 (Business Source) | Yes | Yes (non-prod) | No (until "change date") | Commercial product with eventual OSS (rejected in favor of PIUL — see below) |
| **PIUL-1.0 (Poukai Internal-Use)** | **Only Poukai customers** | **No** | **No** | **Locked choice** — strongest moat, source-available within customer install, license terminates with customer relationship |
| AGPL-3.0 | Yes (with source-share) | Yes (with source-share) | Yes (with source-share) | Strong copyleft moat |
| Commercial / EULA | Per contract | Per contract | No | Per-client paid license |

**Locked (2026-05-20)**: **Poukai Internal-Use License v1.0 (PIUL-1.0)** for both autopost and `@poukai-inc/ui`. Source-available, customer-only, no public OSS posture, license terminates with customer relationship. BSL 1.1 was the original recommendation; founder elected stricter posture. **Template in `LICENSE` pending counsel review before first client distribution.** See `decisions/0001-licensing.md`.

### 7.2 DS license — blocker

`@poukai-inc/ui@0.18.0` ships `"license": "UNLICENSED"`. Self-host install includes the DS bundle on the client's machine — currently UNLICENSED bars that legally. Either:

- Relicense `@poukai-inc/ui` to match autopost's license, OR
- Carve a narrow grant: "permitted to redistribute as part of autopost binary."

**Locked**: `@poukai-inc/ui` relicensed to **PIUL-1.0** (same as autopost). MIT was the original recommendation, but founder elected matching-license posture to preserve brand integrity (DS cannot be extracted and republished under permissive license). Requires PR in `poukai-inc/poukai-ui` to replace `"license": "UNLICENSED"` → `"license": "SEE LICENSE IN LICENSE"` + ship identical `LICENSE` file.

### 7.3 Dependency license sweep

Current `package.json` includes `next-auth@5.0.0-beta.30` (ISC), `mongoose` (MIT), `@aws-sdk/*` (Apache-2.0), `openai` (Apache-2.0), `lucide-react` (ISC). All compatible. R-064 license-check CI gate will enforce going forward.

---

## 8. Revised phases (supersedes v1 §4)

### Phase 0 — Founder decisions (< 1 week)

0a. **License pick** for autopost and `@poukai-inc/ui`. ✅ **LOCKED**: PIUL-1.0 (Poukai Internal-Use License) for both. See `LICENSE` (template, pending counsel review) and `decisions/0001-licensing.md`.
0b. **DB pick** — Postgres + Drizzle (default per §3.2). Document in `decisions/0002-database.md`.
0c. **Distribution shape** — confirm two artifacts (hosted + self-host bundle). Document in `decisions/0003-distribution.md`.
0d. **Hosting stack** — Neon + R2 + Vercel + Resend + Hetzner (default per §5.1). Document in `decisions/0004-hosting.md`.
0e. **UI path** — Path C hybrid (default per §3a.1); confirms 2-3 wk Phase 3. Document in `decisions/0005-ui-path.md`.
0f. **Dark mode** — keep with token override, drop for now, or push to DS. Document in `decisions/0006-dark-mode.md`.
0g. **Notification channels** — confirm pluggable abstraction (§6a); pick MVP channel set (email + in-app + Slack). Document in `decisions/0007-notifications.md`.

No code lands until 0a-0g sign-off.

### Phase 1 — Operational hygiene (1 week, BLOCKING)

Verbatim from v1. Without this, every later PR is unverifiable.

1. pnpm + Node 20 pin + `pnpm-lock.yaml`; delete `package-lock.json`.
2. ~~Delete dead deps (`mysql2`, `dotenv`)~~ — KEEP, both used. Delete tracked backup file only (already done as item 11).
3. CI: install (frozen) → lint → typecheck → build → audit → license-check → gitleaks → test.
4. `console.*` → `lib/logger.ts` (pino); `no-console: error` in eslint.
5. `vercel.json` security headers; remove `crons` block (deferred to Phase 5 decision).
6. `CRON_SECRET` from `?key=` → `Authorization: Bearer` header.
7. Remove hardcoded `192.168.1.9` IP; require `OLLAMA_BASE_URL` env.
8. Remove placeholder secrets from `Dockerfile`.
9. Mongoose hardening (interim, until §3 cutover): `serverSelectionTimeoutMS`, `connectTimeoutMS`, `maxPoolSize`.
10. Resolve `O_API_KEY` vs `OPENAI_API_KEY` naming drift.
11. Remove `EMAIL_FROM` default `noreply@schedular.primestrides.com` (`lib/email.ts:14`); make env-required, fail-fast.

### Phase 2 — Postgres + multi-tenancy + notifications (2-3 weeks)

12. Drizzle schema (`db/schema.ts`) mirroring 9 Mongo models + `Organization` + `OrganizationMember` + `Notification` (in-app feed).
13. RLS policies; per-request middleware sets `SET LOCAL app.current_org_id` inside tx.
14. Repository layer (`db/queries/`): every query takes `orgId` first arg.
15. Mongo→Postgres migration script (`scripts/migrate-mongo-to-postgres.ts`), idempotent, high-water-mark per collection.
16. Dual-write window (≥1 week elapsed) → read switchover → Mongo decommission.
17. NextAuth `@auth/drizzle-adapter` replaces `lib/mongodb.ts` session storage.
18. S3 key prefixing: `org_<uuid>/page_<uuid>/<filename>`; rewrite `lib/s3.ts` to require org-prefixed keys.
19. Per-org AI usage tracking (add `organization_id` to `AIUsage`).
20. Per-org OAuth credentials table (`Page.linkedin_client_id`, `linkedin_client_secret_encrypted`); deprecate global `LINKEDIN_CLIENT_ID` env (kept as fallback for hosted SaaS shared-app mode).
21. First-boot wizard: detect zero orgs, create Org #1 + owner.
22. `lib/notifications/` abstraction (§6a): channel adapters (email/slack/discord/inapp), event renderers, per-org `notification_channels` config.
23. Migrate `sendApprovalEmail` / `sendAutoApprovalNotification` / token-alert email calls → `notify(orgId, event, data)`.

### Phase 3 — Design system adoption — Path C hybrid (2-3 weeks)

24. `.npmrc` + `NPM_TOKEN`; install `@poukai-inc/ui`.
25. React 19 ↔ DS peerDep `>=18` validation; downgrade React or push DS bump.
26. Pin `lucide-react` to `>=0.400.0 <0.600.0` (DS peer compatibility).
27. Import `@poukai-inc/ui/tokens.css` in `app/layout.tsx`.
28. **Build `components/ui/` app-local primitives** on Radix + DS tokens (shadcn/ui patterns): `Input`, `Textarea`, `Select`, `Combobox`, `Checkbox`, `RadioGroup`, `Switch`, `Label`, `HelperText`, `ErrorMessage`, `Spinner`, `Skeleton`, `Toast`, `Tooltip`, `ProgressBar`, `DropdownMenu`, `Tabs`, `Pagination`, `EmptyState`, `Breadcrumb`, `DatePicker`, `TimePicker`, `FileUploader`, `FormField`, `DataTable`.
29. Build `AppShell` organism (sidebar + topbar + content) extending DS `SiteShell`.
30. Replace navbar with `AppShell`.
31. Replace ad-hoc atoms with DS where shape fits (`Button`, `StatusBadge`, `Tag`, `Avatar`, `Eyebrow`, `Dialog`, `Quote`, `FeatureCard`).
32. Replace dashboard forms (`post-form.tsx`, `structured-input-form.tsx`, page settings) with `components/ui/` primitives.
33. **Brand-override contract** (§6): env-driven CSS variables + `BrandWordmark` shim (until DS `Wordmark` accepts `src`).
34. Push DS PR: `Wordmark` accepts `src` prop (or new `BrandMark` atom).
35. Dark mode decision (Phase 0 0f) — implement chosen path.
36. Token-ize hardcoded brand colors (`bg-blue-600` in `navbar.tsx:57`, etc.).
37. Extract inline platform SVGs from `post-card.tsx` to `components/icons/platforms/`.
38. Axe a11y test (`@axe-core/playwright`), 0 violations on top 5 dashboard routes.

### Phase 4 — Distribution packaging (1 week)

39. Hosted: confirm Vercel project on `poukai-inc`; wire **Neon** + **R2** + **Resend** env; smoke-test deploy.
40. Self-host bundle scaffold (`autopost-selfhost/` directory in repo, packaged at release time).
41. `docker-compose.bundle.yml` with `app` + `postgres:16-alpine` + `minio` + `scheduler` + optional `bugsink` + optional `matomo` (compose profiles).
42. `caddy/Caddyfile` for reverse proxy + automatic TLS via Let's Encrypt.
43. `scripts/install.sh` (one-shot) + `scripts/upgrade.sh` + `scripts/backup.sh` + `scripts/restore.sh`.
44. `.env.example` documents every env: required vs optional, hosted-only vs self-host-only, BYO-OAuth, BYO-AI, notification channel URLs.
45. Versioned release pipeline: GitHub Action on tag → push image to GHCR → bundle `autopost-selfhost-vX.Y.Z.tar.gz` → attach to release.
46. Changesets adoption (matches `poukai-ui`).
47. Migration story: `drizzle-kit migrate` runs on container start when `RUN_MIGRATIONS=true`.

### Phase 5 — Observability & cron unification (0.5 week)

48. Matomo on dashboard routes (env-gated, R-009/R-010 budget).
49. Bugsink server + browser SDK; PII scrub server-side.
50. Per-cron metrics (start, duration, success, item-count) → structured log + Bugsink breadcrumb.
51. Cron transport: hosted SaaS uses Vercel crons (re-add `vercel.json` `crons` block with header secret); self-host uses bundled `scheduler` container. Document the split.
52. Health endpoint expansion: `/api/health` reports `{ db: ok|degraded|down, storage: ok|down, ai: ok|degraded, last_cron_runs: {…} }`.

### Phase 6 — Tests, validation, platform cleanup, billing scaffolding (1-1.5 weeks)

53. Zod schemas at every `/api/*` boundary.
54. Rate limiting on `/api/generate`, `/api/blog/*`, `/api/upload` (token-bucket via Postgres advisory locks).
55. CSRF state validation audit on Twitter + Facebook OAuth callbacks.
56. Unit tests for `lib/ai-client.ts`, platform adapters, learning, notification adapters.
57. Integration tests for `/api/cron/*` (mocked DB + platform APIs).
58. E2E: signup → create org → connect LinkedIn → create page → generate → schedule → publish (mocked).
59. Multi-tenant isolation tests: org A cannot read/write org B's posts, even with crafted query.
60. Reach ≥80% changed-file coverage (R-058).
61. Confirm Groq path live or delete (~200 lines in `ai-client.ts`).
62. Remove DEPRECATED fields in `Post` (`linkedinPostId`, `performance`) once `platformResults` is canonical.
63. Stripe scaffolding (hosted SaaS only, behind feature flag): per-org plan tier, usage counters, paywall on `/api/generate` when over quota.

---

## 9. Backlog — prioritized (revised)

Severity: **C** critical, **H** high, **M** medium, **L** low. Priority: P0 (do first), P1 (Phase 1-3), P2 (Phase 4-6), P3 (post-launch).

### P0 — Founder decisions + security blockers

| # | Sev | Task | Output |
|---|---|---|---|
| 1 | C | License pick (autopost + `@poukai-inc/ui`) | `LICENSE`, `decisions/0001-licensing.md` |
| 2 | C | DB pick confirmation (Postgres + Drizzle) | `decisions/0002-database.md` |
| 3 | C | Distribution shape confirmation (hosted + self-host bundle) | `decisions/0003-distribution.md` |
| 4 | C | Hosting-stack confirmation (Neon + R2 + Vercel + Resend + Hetzner) | `decisions/0004-hosting.md` |
| 5 | C | UI path confirmation (Path C hybrid) | `decisions/0005-ui-path.md` |
| 6 | C | Dark mode decision (keep/drop/push-to-DS) | `decisions/0006-dark-mode.md` |
| 7 | C | Notification channels MVP (email + in-app + Slack) | `decisions/0007-notifications.md` |
| 8 | C | Move `CRON_SECRET` query→header | `scheduler/cron-call.sh`, 7× `app/api/cron/*/route.ts` |
| 9 | C | Remove hardcoded `192.168.1.9:11434` | `lib/ai-client.ts:36-37` |
| 10 | C | Strip placeholder secrets from `Dockerfile` build env | `Dockerfile:18-31` |
| 11 | C | Delete tracked `lib/platforms/twitter-adapter.ts.backup` | (delete) |
| 12 | C | Remove `EMAIL_FROM` default `noreply@schedular.primestrides.com`; env-required, fail-fast | `lib/email.ts:14` |

### P1 — Phase 1 hygiene + Phase 2 Postgres/tenancy/notifications + Phase 3 DS Path C

| # | Sev | Task | File(s) |
|---|---|---|---|
| 13 | H | Switch to pnpm; Node pin `>=20 <21` | `package.json`, lockfiles |
| 14 | H | Add CI (install/lint/typecheck/build/audit/gitleaks/license-check/test) | `.github/workflows/ci.yml` (new) |
| 15 | M | ~~Drop `mysql2`/`dotenv`~~ — both alive. Sub-tasks: (15a) document MySQL data-source in `lib/data-sources/README.md`; (15b) consider Node 20 `--env-file` for scripts/ | `lib/data-sources/`, `scripts/` |
| 16 | H | Resolve `O_API_KEY`/`OPENAI_API_KEY` drift | `docker-compose.yml`, `.env.example` |
| 17 | H | `console.*` → `lib/logger.ts`; eslint `no-console: error` | repo-wide |
| 18 | H | `vercel.json` security headers (HSTS, nosniff, Referrer-Policy, Permissions-Policy) | `vercel.json` |
| 19 | H | Pick **one** cron transport per deploy target; document | `vercel.json`, `scheduler/`, `docs/cron.md` |
| 20 | H | Mongoose interim hardening (timeouts, pool size) | `lib/mongodb.ts` |
| 21 | H | Drizzle schema (`db/schema.ts`) — 9 models + `Organization` + `OrganizationMember` + `Notification` | `db/schema.ts` (new) |
| 22 | H | RLS policies on all tenant tables | `db/migrations/*_rls.sql` |
| 23 | H | Repository layer: every query takes `orgId` first arg | `db/queries/*.ts` (new), `app/api/**` |
| 24 | H | Mongo→Postgres migration script (idempotent) | `scripts/migrate-mongo-to-postgres.ts` (new) |
| 25 | H | Dual-write window adapter + cutover plan | `lib/db/dual-write.ts` (temporary), `docs/cutover.md` |
| 26 | H | NextAuth `@auth/drizzle-adapter`; remove Mongo session storage | `lib/auth.ts` |
| 27 | H | S3 key prefixing by `org_<uuid>` | `lib/s3.ts` |
| 28 | H | Per-org `AIUsage` (add `organization_id`) | `db/schema.ts`, `lib/ai-client.ts` |
| 29 | H | Per-org OAuth credentials (BYO LinkedIn/Twitter/Facebook apps); encrypted at rest | `db/schema.ts`, `app/api/auth/**`, `app/dashboard/pages/[id]/settings/page.tsx` |
| 30 | H | First-boot wizard (zero orgs → create Org #1 + owner) | `app/setup/page.tsx` (new), middleware redirect |
| 31 | H | Multi-tenant isolation test harness (org A can't see org B) | `tests/isolation/*.test.ts` (new) |
| 32 | H | Notification abstraction `lib/notifications/` (dispatcher + channels + events) | `lib/notifications/` (new) |
| 33 | H | Migrate `sendApprovalEmail`/`sendAutoApprovalNotification`/token-alert → `notify(orgId, event, data)` | `app/api/blog/generate/route.ts`, `app/api/cron/auto-generate/route.ts`, `app/api/cron/token-refresh/route.ts` |
| 34 | H | In-app notification feed (DB + dashboard bell + read/unread) | `db/schema.ts`, `app/dashboard/notifications/`, `components/ui/notification-bell.tsx` |
| 35 | H | Slack webhook channel adapter | `lib/notifications/channels/slack.ts` (new) |
| 36 | H | `.npmrc` + `NPM_TOKEN` (Vercel env); install `@poukai-inc/ui` | `.npmrc` (new) |
| 37 | H | React 19 ↔ DS peerDep `>=18` validation | `package.json` |
| 38 | H | Pin `lucide-react` to DS-compatible range (`>=0.400.0 <0.600.0`) | `package.json` |
| 39 | H | Import `@poukai-inc/ui/tokens.css` | `app/layout.tsx` |
| 40 | H | Build `components/ui/` app-local primitives (~25 files on Radix + DS tokens, shadcn/ui patterns) | `components/ui/{input,textarea,select,combobox,checkbox,radio-group,switch,label,helper-text,error-message,spinner,skeleton,toast,tooltip,progress-bar,dropdown-menu,tabs,pagination,empty-state,breadcrumb,date-picker,time-picker,file-uploader,form-field,data-table}.tsx` |
| 41 | H | Build `AppShell` organism extending DS `SiteShell` (sidebar + topbar + content) | `components/app-shell.tsx` (new) |
| 42 | H | Replace navbar with `AppShell` | `components/navbar.tsx` (delete), `app/layout.tsx` |
| 43 | H | Replace ad-hoc atoms with DS where shape fits (`Button`, `StatusBadge`, `Tag`, `Avatar`, `Eyebrow`, `Dialog`, `Quote`, `FeatureCard`) | `components/*.tsx` |
| 44 | H | Replace dashboard forms with `components/ui/` primitives | `components/post-form.tsx`, `structured-input-form.tsx`, `app/dashboard/pages/**/settings/page.tsx` |
| 45 | H | Brand-override contract (env-driven CSS vars: `BRAND_PRIMARY`, `BRAND_WORDMARK_URL`, `BRAND_NAME`, `BRAND_FAVICON_URL`) | `app/brand-override.css` (new), `app/layout.tsx` |
| 46 | H | Push DS PR: `Wordmark` `src` prop (or new `BrandMark` atom) | `poukai-ui` PR |
| 47 | H | Dark mode — implement Phase 0 0f decision | `app/globals.css`, `app/brand-override.css` |
| 48 | H | Token-ize hardcoded brand colors (`bg-blue-600` in `navbar.tsx:57`, etc.) | `components/**` |
| 49 | H | Extract inline platform SVGs to `components/icons/platforms/` | `components/icons/platforms/{linkedin,twitter,facebook,instagram}.tsx`, `components/post-card.tsx` |
| 50 | M | Replace cards with DS molecules (`LinkCard`, `FeatureCard`, `TeamCard`, `Quote`) where shape fits | `components/*card*.tsx` |
| 51 | M | Zod input validation on all `/api/*` bodies | `app/api/**/route.ts` |
| 52 | M | ESLint flat config matching `poukai-ui` | `eslint.config.mjs` |
| 53 | M | Prettier config matching `poukai-ui` | `.prettierrc` (new) |
| 54 | M | License-check CI gate (MIT/Apache-2.0/ISC/BSD allowlist) | `.github/workflows/ci.yml`, `.github/scripts/license-check.mjs` |
| 55 | M | Pin all prod deps to exact versions (R-065) | `package.json` |
| 56 | M | `.gitignore` entries for `.omc/`, `.vercel/`, `.next/`, IDE | `.gitignore` |
| 57 | M | Axe a11y test on top 5 dashboard routes | `tests/a11y/` (new) |

### P2 — Phase 4 distribution + Phase 5 observability + Phase 6 tests

| # | Sev | Task | File(s) |
|---|---|---|---|
| 58 | H | Hosted SaaS env wiring (Neon `DATABASE_URL`, R2 `S3_ENDPOINT`/keys, Resend API key, Vercel project) | Vercel env, `.env.example` |
| 59 | H | `autopost-selfhost/` bundle scaffold | new directory |
| 60 | H | `docker-compose.bundle.yml` (app + `postgres:16-alpine` + `minio` + `scheduler` + optional `matomo`/`bugsink` via profiles) | `autopost-selfhost/docker-compose.yml` |
| 61 | H | `caddy/Caddyfile` reverse proxy + auto-TLS | `autopost-selfhost/caddy/` |
| 62 | H | `scripts/install.sh`, `upgrade.sh`, `backup.sh` (`pg_dump` + minio snapshot), `restore.sh` | `autopost-selfhost/scripts/` |
| 63 | H | Versioned release pipeline (tag → GHCR push + bundle tarball) | `.github/workflows/release.yml` (new) |
| 64 | H | Changesets adoption (matches `poukai-ui`) | `.changeset/` (new) |
| 65 | H | `RUN_MIGRATIONS=true` runs `drizzle-kit migrate` on container start | `Dockerfile`, entrypoint script |
| 66 | H | Self-host docs (install, upgrade, BYO-OAuth, BYO-AI, notification channels, security, backup) | `autopost-selfhost/docs/` |
| 67 | H | Discord webhook channel adapter | `lib/notifications/channels/discord.ts` (new) |
| 68 | H | Wire Bugsink (server + browser); PII scrub | `app/layout.tsx`, `lib/**` |
| 69 | H | Wire Matomo on dashboard routes (env-gated) | `app/dashboard/**`, `app/layout.tsx` |
| 70 | H | Health endpoint expansion (db/storage/ai/cron/notifications status) | `app/api/health/route.ts` |
| 71 | H | CSRF state validation audit (Twitter, Facebook OAuth callbacks) | `app/api/auth/twitter/callback/route.ts`, `facebook/callback/route.ts` |
| 72 | H | Rate limiting on `/api/generate`, `/api/blog/*`, `/api/upload` (Postgres advisory locks) | `app/api/**/route.ts` |
| 73 | M | Per-cron metrics (start/duration/success/count) | `app/api/cron/**` |
| 74 | M | Per-org cron loops (one slow tenant must not block others) | `app/api/cron/**` |
| 75 | M | Unit tests for `lib/ai-client.ts` (model selection, rate-limit branches) | `lib/__tests__/ai-client.test.ts` (new) |
| 76 | M | Unit tests for `lib/platforms/*-adapter.ts` | `lib/platforms/__tests__/` |
| 77 | M | Unit tests for `lib/notifications/` (dispatcher + each channel adapter) | `lib/notifications/__tests__/` (new) |
| 78 | M | Integration tests for `/api/cron/*` (mocked DB + platform APIs + notifications) | `app/api/cron/__tests__/` |
| 79 | M | E2E: signup → org create → LinkedIn connect → page → generate → schedule → publish + notification fires | `tests/e2e/` (new) |
| 80 | M | Reach ≥80% changed-file coverage (R-058) | repo-wide |
| 81 | M | Confirm Groq path live or delete | `lib/ai-client.ts` |
| 82 | M | Remove DEPRECATED `Post` fields (`linkedinPostId`, `performance`) | `db/schema.ts` (Post table) |
| 83 | M | Document platform-adapter contract for adding Instagram | `lib/platforms/README.md` (new) |
| 84 | M | Document secret-rotation policy per env (Neon, R2, Resend, OAuth, Groq) | `docs/secrets-rotation.md` |
| 85 | M | Decide ELK vs Bugsink long-term; drop `elk` network from compose if dead | `docker-compose.yml` |

### P3 — Post-launch polish

| # | Sev | Task | File(s) |
|---|---|---|---|
| 86 | L | Conventional Commits enforcement (commitlint + husky) | `commitlint.config.mjs`, `.husky/` |
| 87 | L | Renovate/Dependabot (auto minor/patch) | `.github/renovate.json` |
| 88 | L | `.well-known/security.txt` once `security@pouk.ai` lives | `public/.well-known/security.txt` |
| 89 | L | `CODEOWNERS` if multi-contributor | `.github/CODEOWNERS` |
| 90 | L | Branch protection rules on `main` | GitHub settings |
| 91 | L | Stripe billing scaffolding (hosted only, flagged) | `lib/billing/`, `app/dashboard/billing/` |
| 92 | L | Per-org Resend domain verification (per-org sender) | `lib/email.ts`, new dashboard page |
| 93 | L | Per-org plan tier feature flags | `lib/feature-flags.ts` |
| 94 | L | Telegram bot channel adapter | `lib/notifications/channels/telegram.ts` (new) |
| 95 | L | Split `lib/openai.ts` (1.4k lines) per-platform | `lib/prompts/{linkedin,twitter,facebook,instagram}.ts` |
| 96 | L | Split `Post` table types (focused Zod schemas per concern) | `lib/types/post/`, `db/schema.ts` |
| 97 | L | Replace `MONGODB_URI` legacy env reference with `DATABASE_URL` | `.env.example`, docs |
| 98 | L | `BACKLOG.md` + `CHANGELOG.md` (matches `poukai-ui`) | repo root |
| 99 | L | `docs/architecture.md` (compose topology, RLS model, cron split, S3 layout, notification flow) | `docs/architecture.md` (new) |
| 100 | L | Admin surface for hosted SaaS: super-admin org list, impersonation audit log | `app/admin/` (new) |
| 101 | L | Telemetry opt-in for self-host (anonymized version + feature usage → poukai for product feedback) | `lib/telemetry.ts` (new), env-gated default-off |
| 102 | L | i18n scaffolding (en first, then es/pt) | `next-intl` or equivalent |
| 103 | L | Migrate to Supabase Auth / push more atoms upstream to DS (post-launch evaluation) | TBD |

---

## 10. Risks (revised)

| Risk | Mitigation |
|---|---|
| Postgres migration is biggest single change; data loss possible in cutover | Dual-write window ≥1 week; read-from-Mongo until verified; backup before cutover; rollback plan documented |
| RLS misconfiguration leaks tenant data | Phase 6 isolation test harness is HARD gate; pen-test before SaaS opens to second customer; per-request `SET LOCAL` audited |
| **PIUL-1.0 LICENSE is engineering-drafted template** | **HARD BLOCKER** before first client distribution: engage licensed counsel to review, redraft, and resolve every `TODO` in the `LICENSE` text. Do NOT attach template to any customer agreement. |
| PIUL custom EULA = higher client-legal friction than standard SPDX license | Counter-balance with strong Customer Agreement template + clear FAQ; offer source-availability + audit rights as the trust-building lever |
| Custom license breaks Poukai R-064 license-check CI gate (allowlist is MIT/Apache/ISC/BSD) | Update R-064 allowlist config to accept `SEE LICENSE IN LICENSE` for first-party Poukai packages only (still rejects for transitive deps) |
| `@poukai-inc/ui` UNLICENSED blocks self-host distribution | License decision in Phase 0; DS PR is first dependency, scheduled before Phase 3 |
| **DS missing dashboard primitives** (no Input/Select/Table/Toast) | Path C hybrid (§3a): build app-local primitives in `components/ui/` on Radix + DS tokens; ~1,200 LoC; reuses shadcn/ui patterns |
| **Phase 3 effort underestimated** (1-1.5 wk in v1 → 2-3 wks realistic) | Revised in v2.1; budget 2-3 wks; parallelize with late Phase 2 if React-19 question resolves |
| Per-org OAuth onboarding fragile (clients must create own LinkedIn dev app) | First-class docs + guided wizard in dashboard; for hosted SaaS, offer shared LinkedIn app as fallback |
| Self-host clients run unsupported Postgres versions | `install.sh` pins `postgres:16-alpine`; document supported PG version range; upgrade script handles minor bumps |
| React 19 vs DS peerDep `>=18` | Validate before Phase 3 starts; if Next 16 pins React 19, push DS peerDep bump first |
| Multi-tenancy code paths slow down N=1 self-host | RLS adds <1ms per query at scale; immaterial for N=1; instrument and confirm |
| Ollama local-model deploys at clients with no GPU | `byo-ai.md` documents minimum specs; Groq fallback supported; warn at first boot if Ollama unreachable |
| Compose-bundled MinIO conflicts with client's existing object storage | `.env.example` exposes `S3_ENDPOINT` override; documented swap path to AWS S3, R2, Wasabi |
| **Email-required workflow breaks LAN-only self-host** | Notification abstraction (§6a) defaults to Slack/in-app for self-host; email optional |
| `EMAIL_FROM` default leaks `schedular.primestrides.com` domain | P0 fix #12: env-required, fail-fast on missing |
| Neon free tier limits (3 GB storage, autosuspend) hit at scale | Upgrade to Neon Pro at ~10 tenants; migration is config-only (no code change) |
| Cloudflare R2 outage = media broken | S3-compat means swap to AWS S3 or Backblaze B2 by env change; document playbook |
| Vercel cold-start on Next.js 16 RSC | Drizzle (no engine binary) keeps cold-start ~50ms; monitor via Vercel Web Analytics |

---

## 11. Bottom line (revised v2.1)

The v2.1 plan turns autopost from a *project* into a *product*. Two architectural bets concentrate the risk: **Postgres + Drizzle + RLS multi-tenancy** (§2-4) and **UI Path C hybrid** (§3a). Everything else is plumbing: pnpm, Node pin, CI, hosting wiring (Neon + R2 + Vercel + Resend + Hetzner), security headers, observability, distribution bundle, notification abstraction.

**Order matters even more than v1**:

1. **Phase 0** (7 founder decisions: license, DB, distribution, hosting, UI path, dark mode, notifications) — < 1 week. Nothing downstream lands without these.
2. **Phase 1** (hygiene + `EMAIL_FROM` fix) — unblocks CI; small change, big leverage.
3. **Phase 2** (Postgres + Drizzle + multi-tenancy + notification abstraction) — architectural rewrite; do not start Phase 3 mid-cutover.
4. **Phase 3** (DS Path C: chrome from DS + ~25 app-local primitives on Radix + DS tokens) — 2-3 wks; parallelizable with late Phase 2 if React-19 question resolves.
5. **Phase 4** (distribution bundle) — only meaningful after multi-tenancy lands.
6. **Phase 5** (observability) — small, important, parallel with Phase 4.
7. **Phase 6** (tests + billing scaffolding) — wraps migration.

**Estimated calendar**: **7-9 weeks single engineer**; **5-6 weeks with two**, with one engineer owning DB/tenancy/notifications and the other owning DS Path C / packaging.

**Estimated PR count**: ~60 atomic PRs.

**Hosted-SaaS monthly cost**: ~$6/mo MVP (free tiers) → ~$70-100/mo Growth tier (10-100 tenants). AWS-equivalent shape would be $250-350/mo + 2 wks infra-eng tax.

**If you can only do one thing**: ship Phase 0 + Phase 1 first. License/DB/hosting decisions are reversible only at huge cost later, and the security exposures in Phase 1 (cron secret in URL, placeholder secrets in Dockerfile, hardcoded private IP, leaking EMAIL_FROM domain) are live today.

**If hosted-SaaS-only is acceptable to start**: cut Phase 4 (distribution bundle); ship hosted on Vercel + Neon + R2 + Resend; defer self-host to v1.1 once hosted shape stabilizes. Trims ~1-1.5 weeks and ~10 backlog items.

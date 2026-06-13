# Backlog — End-to-End Review Findings (2026-06-13)

Source: 5-agent end-to-end review (auth/security, API, data layer, business-logic/cron, frontend).
Status legend: `[ ]` todo · `[x]` done · `[~]` in progress · `[!]` user-action (cannot fix in code) · `[-]` won't-fix/accepted.

Each task: ID — severity — file(s) — problem → fix.

---

## CRITICAL

- [!] **C1** — rotate live secrets — `.env` (GitHub PAT, Anthropic key, LinkedIn client secret). `.env` is gitignored & untracked but values live on disk. → USER ACTION: rotate all 3, move to secrets manager. `[!]`
- [x] **C2** — cron fail-open ×7 — `app/api/cron/{collect-metrics:140,engage:34,auto-generate:62,publish:272,token-refresh:212}` use `if (cronSecret){…}`; `{icp-engage:29,conversation-monitor:28}` use `if(!cronSecret) return true`. Unset secret ⇒ public. → fail closed (reject when `CRON_SECRET` unset).
- [x] **C3** — IDOR `generate` — `app/api/generate/route.ts:63` native `collection('pages').findOne({_id})` no userId. → use `findOwnedPage(session, pageId)`.
- [x] **C4** — IDOR `ai/usage` — `app/api/ai/usage/route.ts:42` `AIUsage.find({date})` no userId scope. → filter by userId or gate admin-only.
- [x] **C5** — ffmpeg command injection — `lib/ffmpeg.ts:212,370,457` `execAsync(exec)` with interpolated metadata/filename. → `execFile` with args array.
- [x] **C6** — prompt injection `conversation-manager` — `lib/engagement/conversation-manager.ts:405,476` raw external content into LLM, no `sanitizeExternalContent()`/`<UNTRUSTED_EXTERNAL>`. → apply pattern from `icp-engagement-agent.ts`.
- [x] **C7** — SSRF data-sources — `app/api/pages/[id]/data-sources/test/route.ts:33` user connectionString, no host allowlist. → block RFC1918/link-local/loopback; allowlist.
- [x] **C8** — destructive migration — `db/migrations/0003_fix_enums.sql:1-16` enum recreate, `USING ::enum` throws on removed values. → add `UPDATE … CASE` value remap before swap.

## HIGH

- [x] **H1** — IDOR upload DELETE — `app/api/upload/[id]/route.ts:36` only `key.includes(id)`. → persist `{userId,s3Key}`, verify owner.
- [x] **H2** — NoSQL operator injection — `app/api/pages/[id]/posts/route.ts:42` raw `query.status=status`. → allowlist.
- [x] **H3** — error leak in 500s — `posts/[id]/retry:83`, `posts/[id]/reprocess:142`, `ai/usage:96` return `details:error.message`. → drop `details`.
- [x] **H4** — `POUK_CLIENT_SECRET` empty fallback — `lib/auth.ts:50` `?? ''`. → throw on missing.
- [x] **H5** — plaintext tokens at rest — `db/schema.ts:117,157,200`, `lib/models/User.ts:57`, data-source connection strings. → AES-256-GCM envelope encrypt.
- [x] **H6** — lockless crons — `icp-engage`, `collect-metrics`, `token-refresh` lack `withLock()`. → wrap.
- [x] **H7** — `.save()` on POJO — `app/api/pages/[id]/data-sources/test/route.ts:131` page from native `findOne` (POJO), `.save()` throws. → `Page.findOne` or native `updateOne`.
- [-] **H8 (deferred — unused scaffold; org-based RLS, needs schema design not withUser)** — RLS bypass — `db/queries/pendingConnections.ts:11-22` raw `db` not `withUser()`. → use `withUser` / explicit GUC.

## MEDIUM

- [ ] **M1** — no Zod boundary validation — all routes cast `request.json()`. → add Zod, priority nested bodies (`pages POST`, `generate POST`, `data-sources POST`).
- [~] **M2** — unbounded `limit` — `engagements:36`, `engagements/replies:33`, `comments/suggestions:30`, `pages/[id]/posts:38`, `data-sources/content:27`. → `Math.min(limit, MAX)`.
- [ ] **M3** — unbounded selects (PG) — `db/queries/{pages:14,engagementHistory:20,notifications:19,engagementTargets:25,commentSuggestions:14}`. → add limit param.
- [x] **M4** — mass-assignment — `app/api/pages/[id]/data-sources/route.ts:253` `Object.assign(existingSource, updates)`. → allowlist fields.
- [x] **M5** — fail-open quality gate — `lib/engagement/conversation-manager.ts:229` scoring failure → 0.7 (= threshold). → default below threshold / fail closed.
- [ ] **M6** — no per-run AI budget — `lib/engagement/icp-engagement-agent.ts:1040`. → `maxAICallsPerRun` counter.
- [ ] **M7** — unsanitized prompts — `lib/openai.ts:880 analyzePost`, `283 improvePost(instructions)`. → sanitize+delimit.
- [ ] **M8** — missing `middleware.ts` — per-page auth fragile. → central NextAuth v5 middleware for `/dashboard`,`/api`.
- [ ] **M9** — missing CSP + `X-Frame-Options: DENY` — `vercel.json`. → add headers.
- [ ] **M10** — tokens in client session — `lib/auth.ts:102-104` accessToken/idToken to client. → server-side only.
- [ ] **M11** — email approval token-only — `posts/[id]/approve` GET. → HMAC + short TTL (single-use already ok).
- [ ] **M12** — oversized files >800 — `dashboard/pages/[id]/page.tsx(1068)`, `…/settings(955)`, `pages/new(874)`, `components/post-form.tsx(824)`. → extract components.
- [ ] **M13** — `verifyParity` JSON.stringify — `lib/db/dual-write.ts:103` false mismatch ObjectId/UUID/Date. → custom equals / normalizer.
- [ ] **M14** — migration not transactional — `scripts/migrate-mongo-to-postgres.ts` no tx; orphan ICP skipped silently (`:239`). → wrap in `db.transaction`, log skips.
- [ ] **M15** — Mongo models lack `organizationId` — blocks dual-write (`Post`,`Page`,`Engagement*`,etc). → add field or inject in dual-write adapter.
- [ ] **M16** — PG pool eager init — `db/index.ts:12` `new Pool` at load even if `DATABASE_URL` unset. → lazy/guard.

## LOW

- [ ] **L1** — esbuild devDep audit (3 high, build-time) — bump `drizzle-kit`. `[!]` (dep)
- [ ] **L2** — `next-auth` 5.0.0-beta in prod — track stable. `[-]` (accepted, pinned)
- [ ] **L3** — debug endpoint ungated — `app/api/engagements/debug/route.ts:12`. → gate `NODE_ENV==='development'`/admin.
- [ ] **L4** — `scheduledFor` unvalidated — `posts/route.ts:133`, `posts/[id]/route.ts:131` accepts invalid/past. → validate parseable + future.
- [ ] **L5** — N+1 pages stats — `app/api/pages/route.ts:38-68`. → single `$group` aggregate.
- [ ] **L6** — README cron table ≠ vercel.json — `README.md:168`. → sync.
- [ ] **L7** — email body preview logged in dev — `lib/email.ts:49-53`. → log only to/subject.
- [ ] **L8** — silent empty catches — `lib/ffmpeg.ts:237,401,471`, `lib/s3.ts:97`. → debug log.
- [ ] **L9** — `getFromS3` no max body size — `lib/s3.ts:57-77`. → size cap.
- [x] **L10** — daily-usage cache never evicted — `lib/engagement/conversation-manager.ts:271`. → evict stale dates.
- [ ] **L11** — thin test coverage — 53 tests / 42K LOC, no API integration tests. → add route/IDOR coverage.

---

## Progress log
(append as tasks complete)

# `scripts/` — operational & diagnostic tooling

> Inventory and cleanup guide. These are ad-hoc Node scripts (`.mjs`/`.cjs`/`.ts`)
> run manually against a configured environment (most load `.env` via `dotenv`).
> They are **not** part of the app build and are exempt from the `no-console`
> lint rule (see `eslint.config.mjs`).
>
> Tracking: BACKLOG #150 (AUDIT2-M18) / issue #42. This pass **documents and
> categorizes** the scripts; no files are deleted. Deletion of superseded items
> and conversion of the `test-*` harnesses to real tests are follow-ups (the
> latter depends on the test harness, #117).

## How to run

```bash
node scripts/<name>.mjs        # most scripts
npx tsx scripts/test-stats-reviewer.ts
```

Each expects a populated `.env` (Mongo URI, platform creds, etc.). Treat all of
these as **manual, environment-mutating tools** — several write to the database.

---

## Diagnostics / read-only checks — KEEP

Useful for ops debugging; generally read-only.

| Script | Purpose |
|---|---|
| `check-autonomy.mjs` | Inspect autonomous-posting state |
| `check-facebook-posts.mjs` | List Facebook posts for a page |
| `check-facebook-stats.mjs` | Inspect Facebook metrics |
| `check-twitter.cjs` | Inspect Twitter connection/credentials |
| `debug-conversations.mjs` | Dump conversation/engagement state |
| `debug-generation.mjs` | Trace a content-generation run |
| `diagnose-flow.mjs` | End-to-end flow diagnosis |
| `production-check.mjs` | Production readiness/health checks |

## One-off fixers & cleanups — SUPERSEDED CANDIDATES (review before deleting)

Written to repair specific data incidents. Likely no longer needed; confirm with
the maintainer, then remove or move to a private ops repo.

| Script | Purpose |
|---|---|
| `fix-datasource.mjs` | Repair a page's data-source config |
| `fix-failed-post.mjs` | Re-drive a stuck/failed post |
| `fix-page-type.mjs` | Correct a page's `pageType` |
| `reset-post.cjs` | Reset a post's status |
| `cleanup-and-check.mjs` | Cleanup pass + verification |
| `clear-conversation-lock.mjs` | Clear a stuck conversation/distributed lock |
| `enable-multi-platform.mjs` | Backfill multi-platform fields |

## Migrations — COMPLETED (one-time)

| Script | Purpose |
|---|---|
| `migrate-platforms.mjs` | Legacy LinkedIn → multi-platform `connections` migration |

## Manual test harnesses — REPLACE WITH REAL TESTS (#117)

These reimplement app flows to exercise them by hand. They should be replaced by
Vitest/Playwright suites once the test harness lands (#117), then deleted.

| Script |
|---|
| `create-test-conversation.mjs` |
| `test-approval-email.mjs` |
| `test-auto-generate.mjs` |
| `test-conversation-monitor.mjs` |
| `test-conversation-system.mjs` |
| `test-email.mjs` |
| `test-endpoints.mjs` |
| `test-generation.mjs` |
| `test-human-content.mjs` |
| `test-icp-engagement.mjs` |
| `test-improved-generation.mjs` |
| `test-learning.mjs` |
| `test-linkedin-video.mjs` |
| `test-load-balancing.mjs` |
| `test-response-generation.mjs` |
| `test-stats-reviewer.ts` |
| `test-token-refresh.mjs` |
| `test-twitter-api.mjs` |

> Note: `test-generation.mjs`, `debug-generation.mjs`, and
> `test-improved-generation.mjs` overlap heavily — consolidate when porting to
> real tests.

---

## Cleanup checklist (follow-ups, not done here)

- [ ] Maintainer confirms which **fixers** are obsolete → delete or move to a
      private ops repo.
- [ ] Delete `migrate-platforms.mjs` once the Mongo→Postgres migration (#24/#21)
      makes it moot.
- [ ] Port `test-*` harnesses to Vitest/Playwright under the test harness (#117),
      then remove them here.

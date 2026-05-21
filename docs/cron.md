# Cron transport — autopost

**Decision date**: 2026-05-20
**Related**: BACKLOG P1 #19; `decisions/0003-distribution.md`

Autopost runs 7 scheduled jobs (publish, engage, auto-generate, collect-metrics, icp-engage, token-refresh, conversation-monitor). The codebase historically supported two cron transports simultaneously, which caused drift on which jobs were scheduled where. This document locks the per-deploy-target choice.

## Locked choice

| Deploy target | Cron transport |
|---|---|
| **Hosted SaaS** (Vercel) | **Vercel Crons** via `vercel.json` `crons` block |
| **Self-host bundle** | **Alpine `scheduler` container** with `crond` + `curl` |

One codebase, two transports — picked at deploy time, not build time.

## Why split

- **Vercel Crons** require Vercel infrastructure; not available in self-host.
- **Alpine scheduler** is portable to any Docker host; bundled in `autopost-selfhost.tar.gz`.
- Both transports hit the same `/api/cron/*` route handlers, so the application logic is identical.
- Secret is now sent via `Authorization: Bearer ${CRON_SECRET}` header on both transports (P0 fix; see also `app/api/cron/*/route.ts`).

## Hosted SaaS — Vercel Crons

`vercel.json` ships a `crons` array. Vercel invokes each path on the schedule shown. Vercel automatically adds `Authorization: Bearer ${CRON_SECRET}` to the request (Vercel reads `CRON_SECRET` from project env vars and injects it).

| Path | Schedule | Notes |
|---|---|---|
| `/api/cron/publish` | `*/5 * * * *` | Every 5 min |
| `/api/cron/auto-generate` | `0 6 * * *` | Daily 06:00 UTC |
| `/api/cron/engage` | `*/15 * * * *` | Every 15 min |
| `/api/cron/collect-metrics` | `0 */6 * * *` | Every 6h |
| `/api/cron/conversation-monitor` | `5 */6 * * *` | Every 6h, offset 5min |
| `/api/cron/icp-engage` | `0 */12 * * *` | Every 12h |
| `/api/cron/token-refresh` | `50 * * * *` | Hourly at :50 |

Vercel Cron limits to remember:
- Hobby plan: 2 cron jobs max → autopost requires Pro plan.
- Max frequency: 1 invocation per minute (we don't hit this).
- Max execution time: 60s (Pro) — `/api/cron/publish` and `/api/cron/auto-generate` need to respect this; large per-org loops must be chunked (P2 backlog #74).

## Self-host — Alpine scheduler container

`scheduler/Dockerfile` builds an Alpine + curl image. `scheduler/entrypoint.sh` writes the crontab and starts `crond -f -l 2`. Each cron line invokes `scheduler/cron-call.sh <endpoint>`, which sends:

```sh
curl -fsS -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/$endpoint"
```

Schedule (same as Vercel, defined in `scheduler/entrypoint.sh`):

| Endpoint | Schedule | Source line in `entrypoint.sh` |
|---|---|---|
| `publish` | `*/5 * * * *` | line 29 |
| `engage` | `*/15 * * * *` | line 32 |
| `auto-generate` | `0 6 * * *` | line 35 |
| `collect-metrics` | `0 */6 * * *` | line 38 |
| `icp-engage` | `0 */12 * * *` | line 42 |
| `token-refresh` | `50 * * * *` | line 47 |
| `conversation-monitor` | `5 */6 * * *` | line 52 |

`docker-compose.bundle.yml` (self-host shipping artifact, written in P2 backlog #60) wires:
- `app` service receives `CRON_SECRET` env
- `scheduler` service receives `CRON_SECRET` env + `APP_URL=http://app:3000`
- Both on the same internal Docker network

## Operating notes

### When to change a schedule
Update **both**:
1. `vercel.json` `crons` array
2. `scheduler/entrypoint.sh` crontab lines

A CI check (future task) should fail the build if the two diverge.

### When to add a new cron job
1. Add the route handler under `app/api/cron/<new-job>/route.ts` with the header-based secret check (copy from any existing route).
2. Add an entry to `vercel.json` `crons`.
3. Add an `if ! grep -q "/scheduler/cron-call.sh <new-job>" "$CRONTAB"` block to `scheduler/entrypoint.sh`.
4. Touch the corresponding log file in `entrypoint.sh` (line 17-24 area).
5. Update this document's two tables.

### When to remove a cron job
Reverse of above. Also delete the route file.

### Secret rotation
`CRON_SECRET` is a single value used by both transports.
- Vercel: update env var in Vercel project settings; redeploy.
- Self-host: update `.env`; restart `scheduler` container (`docker compose restart scheduler`); `app` re-reads on next request.

## Why not just one transport?

Considered but rejected:

| Single-transport option | Rejected because |
|---|---|
| Vercel-only | Self-host clients can't reach Vercel Crons (clients run their own infra; Vercel API key would be a shared dependency). |
| Scheduler-only (self-host the scheduler everywhere, even on Vercel) | Vercel doesn't host long-running daemons cleanly; cron container would need a separate Vercel Background Functions deploy or a worker on Fly/Railway, adding cost + complexity. |
| External cron service (cron-job.org, EasyCron) | Vendor dependency; per-org cron secrets at scale = key management mess; outage SPOF outside our control. |

## Per-org cron loops (Phase 6, BACKLOG #74)

Both transports invoke endpoint handlers globally. The handlers themselves iterate over orgs (one slow tenant must not block others). That work is application-layer, not transport-layer — see `app/api/cron/*/route.ts` patterns once Phase 6 lands.

## References

- `vercel.json` — hosted SaaS cron schedule
- `scheduler/entrypoint.sh` — self-host cron schedule
- `scheduler/cron-call.sh` — invocation script (header-based secret)
- `decisions/0003-distribution.md` — two-artifact distribution
- `BACKLOG.md` P1 #19 (this decision), P2 #60 (self-host compose bundle), P2 #74 (per-org cron loops)

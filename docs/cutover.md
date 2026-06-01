# Mongo → Postgres cutover plan

**Status**: planned · **Owner**: founder/eng · **Related**: `decisions/0002-database.md`,
BACKLOG #21–#26, `scripts/migrate-mongo-to-postgres.ts`, `lib/db/dual-write.ts`

Goal: move the live data store from MongoDB to Postgres with **zero data loss**
and an **instant rollback** at every step. Nothing is irreversible until the
final decommission.

## Control flags (`lib/db/dual-write.ts`)

| Flag | Values | Default | Meaning |
|---|---|---|---|
| `DB_WRITE` | `mongo` \| `postgres` \| `both` | `mongo` | which store(s) writes go to |
| `DB_READ` | `mongo` \| `postgres` | `mongo` | which store reads come from |

Mongo is authoritative while it is in the write set; the Postgres write is a
**non-fatal shadow** (failures logged, never thrown). Reads switch independently
of writes, so we can validate Postgres reads while Mongo still backs writes.

## Phases

### 0 — Foundation (done)
Schema (#21), RLS (#22, verified), repository layer (#23, RLS-verified in CI),
backfill script (#24, verified). App still 100% Mongo (`DB_WRITE=mongo`,
`DB_READ=mongo`).

### 1 — Provision + initial backfill
1. Stand up Postgres (Neon hosted / bundled self-host), set `DATABASE_URL`.
2. `pnpm db:migrate` to apply `db/migrations/*`.
3. Run `scripts/migrate-mongo-to-postgres.ts` as a privileged role to backfill.
   Idempotent — safe to re-run.

### 2 — Dual-write window
1. Set `DB_WRITE=both`, keep `DB_READ=mongo`.
2. Wrap each write path in `dualWrite({ mongo, postgres })` (incremental, per
   entity). New rows now land in both stores; Mongo stays authoritative.
3. Re-run the backfill to capture anything written between the snapshot and the
   dual-write deploy (idempotent `ON CONFLICT DO NOTHING`).
4. Watch the `db:dual-write` logs for shadow-write failures; fix and re-deploy.

### 3 — Shadow-read verification
1. For read paths, use `verifyParity(label, { mongo, postgres })` (sampled) to
   compare both stores in the background. Reads still served from Mongo.
2. Drive parity-mismatch count to ~0 over a soak period. Investigate every
   mismatch (usually a missed dual-write or a mapping bug).

### 4 — Cutover reads
1. Flip `DB_READ=postgres`. Reads now come from the Postgres repos (#23);
   writes still go to **both** (Mongo retained for rollback).
2. **Rollback**: set `DB_READ=mongo` — instant, no data implications (Mongo was
   still being written).
3. Soak under real traffic.

### 5 — Stop Mongo writes
1. Final backfill pass, confirm parity.
2. Flip `DB_WRITE=postgres`. Postgres is now sole store; Mongo is read-only/idle.
3. **Rollback window**: Mongo still holds all data up to this flip — a revert to
   `both`/`mongo` loses only post-flip writes (small, recoverable from PG export).

### 6 — Decommission
1. After a clean soak, remove `lib/db/dual-write.ts`, the Mongoose models, and
   `MONGODB_URI`. Replace #97.
2. Tear down the Mongo cluster. Keep a final dump as cold backup.

## Rollback triggers
- Shadow-write failure rate > 0.1% sustained → stay in phase 2, fix mappings.
- Parity mismatches not converging → do not advance past phase 3.
- Error-rate / latency regression after `DB_READ=postgres` → revert `DB_READ=mongo`.
- Any data-loss signal after `DB_WRITE=postgres` → revert to `both`, restore from
  Mongo + a PG export diff.

## Verification assets
- `tests/db/repository.pg.test.ts` — RLS isolation through the repos.
- `tests/db/migration.pg.test.ts` — backfill correctness + idempotency.
- CI `db-tests` job runs both against a real `postgres:16` on every PR.
- `lib/db/dual-write.test.ts` — routing/dispatch + non-fatal shadow behavior.

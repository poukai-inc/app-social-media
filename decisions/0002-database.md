# DECISION-0002: Database

**Status**: Accepted
**Date**: 2026-05-20
**Deciders**: Founder (Arian)
**Supersedes**: —

## Context

Autopost currently uses MongoDB (Mongoose) for all persistent data and MinIO for object storage. Productizing as a self-hostable multi-tenant artifact requires a data layer that supports row-level security for tenant isolation, portable SQL migrations reviewable by client ops teams, and a license compatible with redistribution in a bundled installer. An ORM choice must also be made.

## Decision

Migrate to **Postgres 16 + Drizzle ORM** for relational data and **S3-compatible object storage** (MinIO bundled for self-host, Cloudflare R2 for hosted SaaS). Drop MongoDB and Mongoose entirely.

## Rationale

- **License compatibility**: Postgres uses a BSD-style license — clean for redistribution inside a client-server bundle. MongoDB's SSPL restricts service providers and creates legal ambiguity when autopost is the "service" being bundled.
- **Row-level security (RLS)**: Postgres native RLS enforces multi-tenant isolation at the database layer, not the application layer — a misconfigured query cannot leak cross-tenant data. MongoDB has no equivalent primitive.
- **ACID + cron idempotency**: 7 cron jobs require reliable transactional guarantees (e.g., deduplication of scheduled posts). Postgres ACID semantics make idempotency patterns straightforward; MongoDB's multi-document transactions are bolted-on and operationally heavier.
- **Drizzle over Prisma — no engine binary**: Drizzle has zero native binary; Prisma ships a query engine binary that changes per CPU architecture, adding Docker image bloat per arch in a multi-platform self-host bundle. Drizzle's ~50 ms cold start vs Prisma's ~400 ms matters in Vercel serverless edge functions.
- **Drizzle — native `SET LOCAL` for RLS**: Drizzle exposes raw SQL execution making `SET LOCAL app.current_org_id = $1` before each query trivial. Prisma's middleware layer makes this awkward and non-ergonomic.
- **Plain SQL migrations**: Drizzle generates readable `.sql` migration files that client ops teams can review, audit, and approve before applying an upgrade — a hard requirement for regulated-industry self-host clients. Prisma's migration format is less transparent.

## Alternatives considered

| Option | Why not |
|---|---|
| Stay on MongoDB | SSPL license incompatible with redistribution intent; no RLS; multi-document transactions add operational complexity |
| Supabase (managed Postgres) | Duplicates NextAuth (Supabase has its own auth); bloats self-host bundle with a full Supabase stack; pricing locks clients to Supabase tiers |
| Prisma ORM | Engine binary causes per-arch Docker image bloat; ~400 ms cold start; `SET LOCAL` for RLS requires awkward middleware; migrations less reviewable |
| PlanetScale / CockroachDB / DynamoDB | Vendor lock-in; cannot bundle in a self-host `docker compose` tarball without significant complexity |

## Consequences

**Positive**:
- RLS provides database-enforced multi-tenant isolation — a misconfigured query cannot leak cross-org data
- Plain SQL migrations are auditable by client ops teams before upgrade
- Eliminates MongoDB SSPL from the dependency graph, clearing redistribution licensing

**Negative**:
- ~2 weeks active engineering time for Mongo → Postgres migration (dual-write window + cutover + 9 model rewrites)
- RLS adds approximately <1 ms per query overhead (negligible in practice, but non-zero)

**Follow-ups**:
- Phase 1 schema design: define `organizations`, `users`, `posts`, `platforms`, `scheduled_jobs` tables with `org_id` on every tenant-scoped table
- Drizzle RLS helper (`withOrgContext(orgId, tx => ...)`) to encapsulate `SET LOCAL` pattern
- Dual-write migration strategy documented before cutover
- Neon branching used per PR for migration preview in hosted-SaaS CI

## References

- `MIGRATION_ANALYSIS.md` §3
- https://www.postgresql.org/about/licence/
- https://orm.drizzle.team/

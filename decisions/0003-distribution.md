# DECISION-0003: Distribution Shape

**Status**: Accepted
**Date**: 2026-05-20
**Deciders**: Founder (Arian)
**Supersedes**: —

## Context

Autopost is being productized for two distinct customer segments: early-stage tenants who want a managed hosted service (low ops), and enterprise or regulated clients who need data residency on their own infrastructure. These segments have incompatible deployment environments but should not require a separate codebase or divergent release cadence.

## Decision

Ship **two artifacts from one codebase**: (1) a Vercel deploy as the hosted SaaS, and (2) a `docker compose up` self-host bundle distributed as a versioned tarball and OCI image bundle for client servers.

## Rationale

- **Same image, different orchestration**: The Docker image built for hosted SaaS is identical to the one shipped in the self-host bundle — no drift, no separate build pipeline, no integration-test gap between the two artifacts.
- **Multi-tenancy is universal**: N=1 self-host install runs the exact same multi-tenancy code path as N=many SaaS. First-boot wizard creates Org #1. This means the self-host install is not a stripped-down version — it gets every feature.
- **Enterprise data residency**: Regulated-industry clients (healthcare, finance, government) cannot send data to a third-party SaaS. A `docker compose up` bundle running entirely on their infrastructure is the only viable path into that segment.
- **Self-host bundle composition**: `app` + `postgres:16-alpine` + `minio` + `scheduler` + optional `bugsink`/`matomo` via compose profiles + Caddy reverse proxy with auto-TLS + `install.sh` / `upgrade.sh` / `backup.sh` / `restore.sh` scripts.
- **One release tag publishes both**: A git tag triggers CI to publish the image to GHCR and the bundle tarball to GitHub Releases — no manual coordination between artifacts.

## Alternatives considered

| Option | Why not |
|---|---|
| Hosted SaaS only | Loses the enterprise/regulated-client channel entirely; leaves significant revenue on the table |
| Self-host only | Slower customer iteration (no direct telemetry, no instant rollout); higher support burden without hosted reference deployment |
| Separate codebases | Guaranteed drift; two test matrices; double the migration work for every schema change |

## Consequences

**Positive**:
- Single codebase means every bug fix and feature ships to both deployment targets simultaneously
- Self-host clients get the full multi-tenant engine — no feature-gating complexity at the code level
- Enterprise segment unlocked without architectural compromise

**Negative**:
- Phase 4 budgets ~1 week for bundle scaffolding (compose file, Caddy config, install/upgrade/backup scripts)
- Release pipeline must publish to GHCR + GitHub Releases on every version tag — adds CI complexity

**Follow-ups**:
- `docker-compose.bundle.yml` with named profiles (`core`, `observability`) for optional bugsink/matomo
- Caddy auto-TLS configuration for self-host (no manual cert management for clients)
- `install.sh` script: pulls images, runs first-boot wizard, creates Org #1
- GHCR image publishing and GitHub Release tarball generation in CI (Phase 4)
- Version compatibility matrix between bundle version and hosted SaaS API

## References

- `MIGRATION_ANALYSIS.md` §5

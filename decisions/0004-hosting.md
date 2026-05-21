# DECISION-0004: Hosting Stack (Hosted SaaS Only)

**Status**: Accepted
**Date**: 2026-05-20
**Deciders**: Founder (Arian)
**Supersedes**: —

## Context

The hosted SaaS deployment (see DECISION-0003) needs a concrete infrastructure stack. The stack must be cost-effective at early tenant counts, support Postgres with branching for PR preview environments, have zero or near-zero egress fees for a media-heavy social posting application, and avoid vendor lock-in that would block a future migration to AWS if scale demands it.

## Decision

Hosted SaaS infrastructure: **Neon Pro** (Postgres, $19/mo) + **Cloudflare R2** (object storage, ~$5/mo, zero egress fees) + **Vercel Pro** (compute, $20/mo) + **Resend Pro** (transactional email, $20/mo) + **Hetzner CPX11** (Bugsink + Matomo self-hosted, €4.50/mo).

Growth-tier total: ~$70–100/mo (10–100 tenants). MVP tier (free tiers): ~$6/mo.

## Rationale

- **3–4× cheaper than AWS equivalent**: AWS (RDS + S3 + ECS/Fargate + SES + CloudWatch) runs ~$250–350/mo plus approximately 2 weeks of infra-engineering tax (VPC, IAM, security groups, NAT gateway, load balancer). The chosen stack delivers the same capability for ~$70–100/mo with zero infra-engineering overhead.
- **Cloudflare R2 zero egress**: Media-heavy social posting apps move large volumes of image and video assets. R2's zero egress fee eliminates the #1 AWS bill killer (S3 + CloudFront egress) from day one.
- **Neon branching for PR previews**: Neon creates a database branch per pull request, allowing migration testing against a real Postgres instance in CI without shared state pollution — critical for the Postgres migration in Phase 1.
- **Neon autoscale**: Scales to zero during inactivity (nights, weekends at early tenant counts) — no idle RDS bill.
- **All picks migrate cleanly to AWS**: Neon → RDS/Aurora, R2 → S3 (S3-compatible API), Vercel → ECS/Fargate, Resend → SES, Hetzner → EC2. No proprietary lock-in; migration is operational, not architectural.
- **Hetzner for observability**: Bugsink (error tracking) + Matomo (analytics) are self-hosted on a €4.50/mo CPX11 — avoids Sentry Cloud pricing and Google Analytics data residency concerns for EU clients.

## Alternatives considered

| Option | Why not |
|---|---|
| AWS (RDS + S3 + ECS/Fargate + SES + CloudWatch) | $250–350/mo + ~2 weeks infra-engineering tax (VPC, IAM, security groups, NAT gateway); no advantage at early scale |
| Supabase Cloud | Duplicates NextAuth (Supabase has its own auth system); pricing locks clients into Supabase tiers; not compatible with self-host distribution model |
| Render / Railway | Less mature managed Postgres; no database branching for PR previews; smaller ecosystem |

## Consequences

**Positive**:
- ~70% cost reduction vs AWS equivalent at growth tier frees budget for engineering and customer acquisition
- Neon branching gives every PR a real isolated Postgres environment — safer migration rollouts
- Zero R2 egress fees are permanent regardless of media volume growth

**Negative**:
- Requires four external service credentials in Vercel project env: `DATABASE_URL` (Neon), `R2_*` (Cloudflare), `RESEND_API_KEY`, `NPM_TOKEN` (for `@poukai-inc/ui` private package)
- Hetzner CPX11 is a single point of failure for observability — acceptable at MVP but needs HA consideration at growth scale

**Follow-ups**:
- Add all required env vars to Vercel project and document in `docs/env-vars.md`
- Configure Neon branch-per-PR in GitHub Actions CI workflow
- Set up Bugsink and Matomo on Hetzner CPX11 (Phase 4)
- Review Hetzner HA options (CPX21 + snapshot backup) before first paid client

## References

- `MIGRATION_ANALYSIS.md` §5.1
- https://neon.tech/pricing
- https://developers.cloudflare.com/r2/pricing/
- https://hetzner.com/cloud

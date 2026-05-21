# DECISION-0007: Notification Channels for MVP

**Status**: Accepted
**Date**: 2026-05-20
**Deciders**: Founder (Arian)
**Supersedes**: —

## Context

Autopost currently sends notifications exclusively via email (Resend). Three call sites exist: `sendApprovalEmail`, `sendAutoApprovalNotification`, and a token-alert mailer. Email-only breaks LAN-only self-host installs where no SPF/DKIM/DMARC is configured and email links cannot resolve from the client's private network. A notification strategy must support both hosted SaaS and self-host deployment contexts.

## Decision

Build a **pluggable channel abstraction** at `lib/notifications/` with per-channel adapters. MVP ships **email + in-app feed + Slack webhook**. Discord adapter ships in P2; Telegram adapter in P3. Per-org channel config is stored in `Organization.notification_channels: jsonb`.

## Rationale

- **Email-only is broken for self-host**: LAN-only installs have no outbound SMTP/SPF/DKIM; email links point to the hosted SaaS domain and cannot resolve from inside the client's private network. Self-host installs need at least one channel that works with zero external service setup.
- **Slack webhook is zero-setup for self-host**: Incoming Webhooks require no SMTP, no domain, no cert — just a URL pasted into org settings. This is the default self-host notification channel.
- **In-app feed is the universal fallback**: When no external channel is configured or reachable, in-app notifications always work. Every deployment gets this for free.
- **Pluggable abstraction isolates blast radius**: Adding a new channel (Telegram, PagerDuty, etc.) requires only a new adapter file — zero changes to notification call sites. The dispatcher `notify(orgId, event, data)` fans out to whichever channels the org has enabled.
- **Per-org jsonb config**: Channel configuration stored in `Organization.notification_channels` lets each tenant independently enable/disable channels and store their own webhook URLs — no shared config, no cross-tenant leakage.

## Alternatives considered

| Option | Why not |
|---|---|
| Email only (current state) | Fragile for self-host (no SMTP on LAN installs); single point of failure; link-click failure on private networks |
| Slack-only | Locks out non-Slack shops (many SMB clients use Teams, Discord, or no chat tool) |
| Managed notification service (Knock, Courier, Novu) | Vendor lock-in; adds monthly cost per notification volume; data leaves the self-host boundary — unacceptable for regulated-industry clients |

## Consequences

**Positive**:
- Self-host installs work out of the box with Slack webhook — zero SMTP configuration required
- Adding new channels in future phases (Discord P2, Telegram P3) requires only a new adapter, no call-site changes
- In-app feed provides a complete notification history for audit purposes — useful for regulated clients

**Negative**:
- Phase 2 must migrate three existing email call sites (`sendApprovalEmail`, `sendAutoApprovalNotification`, token-alert) to the new `notify(orgId, event, data)` dispatcher — this is rework, not net-new
- `EMAIL_FROM` env var becomes required (no default) — documented in P0 fix #12; self-host operators without SMTP must explicitly disable the email channel

**Follow-ups**:
- `lib/notifications/index.ts` — dispatcher and channel registry
- `lib/notifications/adapters/email.ts`, `slack.ts`, `in-app.ts` — MVP adapters
- `lib/notifications/adapters/discord.ts` — P2
- `lib/notifications/adapters/telegram.ts` — P3
- `Organization.notification_channels` jsonb column in Drizzle schema (Phase 1 schema work)
- Migrate `sendApprovalEmail`, `sendAutoApprovalNotification`, token-alert to `notify()` dispatcher (Phase 2)

## References

- `MIGRATION_ANALYSIS.md` §6a

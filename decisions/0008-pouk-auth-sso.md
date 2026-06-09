# 0008 — Migrate login to pouk-auth SSO; demote LinkedIn to a connect flow

- Status: Proposed
- Date: 2026-06-09
- Deciders: Arian

## Context

social.pouk.ai (autopost) currently authenticates users with **LinkedIn OIDC**,
and that same login OAuth captures the `w_member_social` **posting token** (stored
on `user.linkedinAccessToken` by the next-auth jwt callback in `lib/auth.ts`).
LinkedIn therefore does double duty: identity *and* posting authorization.

pouk-auth (https://id.pouk.ai) is live — a standards-compliant OIDC provider
(discovery / authorize / token / jwks / userinfo) with email+password, TOTP MFA,
and drop-in support for next-auth v5 OIDC clients. Clients are declared in its
`CLIENTS_JSON` env. It is the intended identity layer for every `*.pouk.ai` app
(cal, portal, social).

Two distinct concerns are conflated today:
1. **Identity** — "who is this user." Today = LinkedIn. Can move to pouk-auth.
2. **Posting token** — the LinkedIn token to post on the user's behalf. MUST
   remain a LinkedIn OAuth grant regardless of how identity is established.

Twitter and Facebook already use standalone "connect" flows
(`app/api/auth/twitter/*`, PendingConnection/Page models). LinkedIn is the only
network coupled to login.

## Decision

Adopt pouk-auth SSO for **identity**. Demote LinkedIn from the login provider to
an in-app **"Connect account"** step that captures the posting token — mirroring
the existing Twitter/Facebook pattern. Posting consumers
(`lib/linkedin.ts`, which reads `user.linkedinAccessToken` / `linkedinId` /
`linkedinAccessTokenExpires`) stay unchanged.

Target:
```
Login:    social.pouk.ai -> pouk-auth (OIDC, MFA) -> identity (user.id, email)
Connect:  in-app "Connect LinkedIn" -> LinkedIn OAuth -> token on user record
Post:     lib/linkedin.ts reads user.linkedinAccessToken (unchanged)
```

## Plan

### Phase 0 — Prereqs
- Confirm pouk-auth prod stack + `CLIENTS_JSON` location (the `pouk-auth` compose
  project on the box).
- Decide user provisioning: who seeds pouk-auth accounts for clients
  (`scripts/seed.ts` today; admin UI on pouk-auth roadmap).

### Phase 1 — Register social as an OIDC client (pouk-auth side)
Add to `CLIENTS_JSON`:
```json
{ "client_id": "social", "client_secret": "<gen>",
  "redirect_uris": ["https://social.pouk.ai/api/auth/callback/pouk"],
  "post_logout_redirect_uris": ["https://social.pouk.ai/login"] }
```
Redeploy pouk-auth; verify discovery + the new client.

### Phase 2 — Add pouk provider to autopost (login swap)
- `lib/auth.ts`: add next-auth v5 OIDC provider `pouk` (issuer `https://id.pouk.ai`,
  PKCE, client id/secret from env). Keep JWT session strategy.
- jwt/session callbacks: map identity from pouk claims (`sub` -> user.id, email).
  STOP reading the LinkedIn token here.
- Env: `POUK_ISSUER`, `POUK_CLIENT_ID`, `POUK_CLIENT_SECRET` -> compose + box `.env`.

### Phase 3 — LinkedIn connect flow (decouple posting token)
- New routes `app/api/auth/linkedin/connect` + `/callback`, mirroring
  `app/api/auth/twitter/*`. Scope `openid profile w_member_social`.
- On callback, write `linkedinAccessToken`, `linkedinId`,
  `linkedinAccessTokenExpires` to the current pouk-authenticated user — the exact
  fields posting already reads, so `lib/linkedin.ts` needs no change.
- Existing `token-refresh` cron already targets these fields — keep.

### Phase 4 — UI (DS only, per design-system rule)
- Login page: "Sign in with pouk" replaces the LinkedIn button.
- Dashboard/settings: "Connect LinkedIn" alongside X/FB; show connected state.

### Phase 5 — User migration
- Bridge in the jwt `signIn` callback: on first pouk login, match existing user
  by email -> attach to that record (preserve `linkedinAccessToken`, posts);
  else create. Maps pouk `sub` to the existing user.
- One-time: ensure each existing user has a pouk-auth account (same email).

### Phase 6 — Cutover + verify
- Deploy. Test: pouk login -> connect LinkedIn -> schedule -> publish (real post).
  X/FB still work. Logout -> pouk post-logout redirect.

## Risks

| Risk | Mitigation |
|---|---|
| Posting breaks if connect doesn't fill `user.linkedinAccessToken` exactly | Keep field names identical; integration-test publish before cutover |
| Account orphaning (pouk `sub` != old user) | Email-match bridge in jwt `signIn` (Phase 5) |
| Two OAuth flows confuse users | Clear UI: login vs connect; gate dashboard until LinkedIn connected |
| pouk-auth single point of failure | id.pouk.ai already gates cal/portal; same blast radius; monitor |
| No tenant isolation in pouk-auth yet (roadmap) | Tenant scoping stays autopost's job (org RLS, post-PG-cutover) |
| `CLIENTS_JSON` secret management | client_secret in pouk-auth env only; social side in box `.env` |

## Rollback
Revert `lib/auth.ts` to the LinkedIn provider + redeploy. LinkedIn connect routes
are additive (harmless if login reverts). The pouk client entry can remain.

## Consequences
- One pouk identity across cal/portal/social; central user store + MFA.
- All social networks become uniform "connects"; LinkedIn no longer special.
- Two user steps (login, then connect socials) instead of one.
- Effort: medium — Phases 1–4 are one focused session; Phase 5 is trivial while
  the user count is ~1.

## Sequencing
Pairs with the Mongo->Postgres cutover (#21–26): pouk-auth + RLS tenant isolation
is the real multi-client foundation. Prefer doing the PG cutover first or together.

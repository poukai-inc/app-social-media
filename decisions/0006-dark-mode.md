# DECISION-0006: Dark mode

**Status**: Accepted (revised 2026-05-31)
**Date**: 2026-05-31 (orig. 2026-05-20)
**Deciders**: Founder (Arian)
**Supersedes**: Revision 1 of this ADR (2026-05-20, "Keep — app-local dark-tokens.css")

## Revision 2026-05-31 — supersedes app-local dark mode

Founder reversed the app-local call: **dark mode is owned by `@poukai-inc/ui`**. The DS `tokens.css` provides both light and dark theme values; the app consumes them and does not maintain its own `app/dark-tokens.css` override. This follows from ADR-0005 rev-2 (full DS adoption) — a parallel app-local theme would contradict single-source-of-UI-truth.

Action: open a DS issue to add dark-theme tokens to `@poukai-inc/ui`; remove `app/dark-tokens.css` once the DS ships them; apply theme via the DS's documented toggle/`prefers-color-scheme` mechanism.

The original app-local analysis below is retained as historical context but is **superseded**.

---

## Context

Existing autopost dashboard uses `dark:*` Tailwind variants extensively across all ~13 components and 18 dashboard pages (verified via `grep "dark:" components/ app/`). Users currently rely on automatic light/dark theming following their OS preference. The Poukai DS (`@poukai-inc/ui@0.18.0`) ships `tokens.css` with light-theme values only — no dark-theme token override.

Migration to Path C hybrid (decision 0005) requires choosing one of three dark-mode strategies before Phase 3 token-ization work (P1 backlog items 47, 48) can start.

## Decision

**Keep dark mode. Build a dark-theme token override file (`app/dark-tokens.css`) layered on top of `@poukai-inc/ui/tokens.css`.** Apply via `:root.dark` selector or `@media (prefers-color-scheme: dark)` (both — explicit class for user toggle + media query for system default).

App-local primitives in `components/ui/` (P1 backlog #40) consume tokens, not raw color values, so they get dark theme for free once tokens flip.

## Rationale

- **Existing user expectation**: dashboard already supports dark mode; stripping it is a visible regression.
- **Minimal Phase 3 cost**: ~1 day to author the override file by enumerating DS tokens and mapping each to a dark-mode equivalent (zinc-900 surfaces, zinc-100 text, etc.). Smaller than the cost of refactoring every `dark:` variant out of the codebase.
- **Path C parity**: app-local primitives sourced from shadcn/ui patterns ship dark-mode-ready by default; the override file is the same shape shadcn examples use.
- **No DS coordination friction**: option (c) push-to-DS requires DS owner sign-off, blocks Phase 3, and over-commits Poukai to maintaining a dark theme for the marketing site (which doesn't use one). Keep dark theme as an app-local concern for now; promote upstream later if other Poukai apps want it.
- **Backward compat**: existing `dark:bg-zinc-900` Tailwind classes continue to work alongside token-based components during the gradual migration in Phase 3.

## Alternatives considered

| Option | Why not |
|---|---|
| (b) Drop dark mode | Visible regression for users; refactor effort across all components/pages probably exceeds the override-file effort. |
| (c) Push dark theme upstream to DS | Requires DS owner sign-off; blocks Phase 3 start; over-commits DS (marketing site has no dark mode and doesn't need one). |
| Skip dark mode for v1, add in v1.1 | Same as (b) — regression. |

## Consequences

**Positive**:
- Zero user-visible regression on dashboard color scheme.
- New app-local primitives (`components/ui/`) get dark mode automatically via token override.
- Toggle UI (manual light/dark switch) can be added later as a simple class swap on `<html>`.

**Negative**:
- One extra CSS file (`app/dark-tokens.css`) to maintain alongside DS `tokens.css`. Drift risk: if DS adds a new token, this override must mirror it. Mitigation: lint check that every token in `@poukai-inc/ui/tokens.css` has a corresponding override in `dark-tokens.css` (add to CI in P1 backlog #41 axe test pipeline or as a separate check).
- During Phase 3 migration, components in transition will mix `dark:*` Tailwind utilities AND token-based styles. Temporary inconsistency acceptable; resolved as each component migrates.

**Follow-ups**:
- Author `app/dark-tokens.css` as part of P1 backlog #47 (dark-mode implementation task) — already in scope.
- Add a CI check that DS tokens and app dark-token override stay in sync (new task — add to P2 if not already).
- Document the override pattern in `docs/dark-mode.md` for future Poukai apps to follow.

## References

- `MIGRATION_ANALYSIS.md` §3a.3 (Other UI blockers)
- `decisions/0005-ui-path.md` (Path C hybrid)
- BACKLOG P1-H items 47 (dark mode implementation) + 48 (token-ize brand colors)
- shadcn/ui dark-mode docs: https://ui.shadcn.com/docs/dark-mode/next

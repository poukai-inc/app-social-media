# DECISION-0005: UI Integration Path

**Status**: Accepted (revised 2026-05-31)
**Date**: 2026-05-31 (orig. 2026-05-20)
**Deciders**: Founder (Arian)
**Supersedes**: Revision 1 of this ADR (2026-05-20, "Path C hybrid")

## Revision 2026-05-31 — supersedes Path C

Founder reversed the Path C hybrid call: **use `@poukai-inc/ui` for everything**. The app does not maintain a parallel `components/ui/` primitive library. Where the DS lacks a needed primitive (Input, Select, Table, Toast, Combobox, DatePicker, FileUploader, etc.), **open an issue/PR upstream to `@poukai-inc/ui`** and consume it once shipped — do not fork it into the app.

Rationale for the change:
- Single source of UI truth across all Poukai apps; no app-vs-marketing divergence.
- DS gaps become tracked upstream work (issues on `poukai-inc/poukai-ui`) instead of permanent app-local debt.
- Trade-off accepted: app UI work can block on DS delivery for missing primitives; mitigated by prioritising the DS issues that gate launch.

The original Path C analysis below is retained as historical context but is **superseded**.

---

## Context

Autopost has ~11,700 lines of existing UI code. The Poukai design system (`@poukai-inc/ui` v0.18.0) provides brand and marketing atoms. A decision is needed on how much of the DS to use, how to handle the ~68% of UI surface the DS does not cover (form controls, data tables, toasts, etc.), and how to sequence the work without blocking product delivery.

## Decision

Use **Path C hybrid**: adopt `@poukai-inc/ui` for chrome and brand atoms; build app-local primitives in `components/ui/` on top of Radix UI (already a transitive DS dependency) and DS design tokens — following shadcn/ui sourcing patterns.

## Rationale

- **DS is marketing-shaped, not app-shaped**: `@poukai-inc/ui` v0.18.0 provides editorial atoms (Hero, Principle, FailureMode, Portrait, Quote, FeatureCard, Wordmark) plus chrome (`SiteShell`-derived `AppShell`). It has no Input, Select, Table, Toast, Combobox, DatePicker, or FileUploader. Weighted DS coverage of existing 11,700 LoC UI is ~32% — two-thirds of the surface is inherently bespoke.
- **DS atoms to adopt**: `AppShell` (from `SiteShell`), `Wordmark`, `Button`, `StatusBadge`, `Tag`, `Avatar`, `Eyebrow`, `Dialog`, `Quote`, `FeatureCard`.
- **~25 app-local primitives to build**: Input, Textarea, Select, Combobox, Checkbox, RadioGroup, Switch, Label, HelperText, ErrorMessage, Spinner, Skeleton, Toast, Tooltip, ProgressBar, DropdownMenu, Tabs, Pagination, EmptyState, Breadcrumb, DatePicker, TimePicker, FileUploader, FormField, DataTable. Built on Radix (already in the dep graph as a DS transitive) + DS tokens.css — sourced via shadcn/ui patterns for maximum quality and minimal maintenance burden.
- **Path A rejected**: Growing `@poukai-inc/ui` into a dashboard DS requires 2–3 weeks of DS-owner work upfront plus DS owner approval for every primitive. Blocks autopost Phase 3.
- **Path B rejected**: A separate `autopost-ui` library duplicates effort with no benefit at current scale — two design systems to maintain, no shared consumers.
- **Net LoC improvement**: ~1,200 new primitive LoC replacing ~5,000 LoC of duplicated Tailwind class soup — a net reduction and a more maintainable surface.

## Alternatives considered

| Option | Why not |
|---|---|
| Path A — extend DS into a dashboard DS | 2–3 weeks DS owner work upfront before any autopost UI work can start; requires DS owner approval cadence for each primitive; blocks Phase 3 delivery |
| Path B — separate `autopost-ui` lib | Two design systems to maintain with no shared downstream consumers at current scale; duplicates Radix setup and token configuration |

## Consequences

**Positive**:
- Phase 3 can start immediately — no DS owner gating
- Radix primitives are already in the dep graph (DS transitive), so no new heavy dependencies
- Stable app-local primitives can be promoted upstream to DS as Path A becomes worthwhile in the future

**Negative**:
- Phase 3 budget revised upward: 2–3 weeks (from v1's estimated 1–1.5 weeks) to account for building the ~25 app-local primitives
- Until DS grows app-shaped atoms, autopost UI and DS will diverge slightly in interaction patterns — requires coordination at design review

**Follow-ups**:
- DS PR needed for `Wordmark` `src` prop to support white-label token override (env-driven CSS custom properties)
- Define DS token import strategy (`tokens.css`) in `components/ui/tokens.ts` before first primitive is built
- Establish promotion criteria: when a primitive is used in 2+ Poukai apps, nominate it for upstream DS inclusion (Path A over time)

## References

- `MIGRATION_ANALYSIS.md` §3a
- `MIGRATION_ANALYSIS.md` §8 Phase 3

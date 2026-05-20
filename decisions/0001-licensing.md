# DECISION-0001: Licensing

**Status**: Accepted
**Date**: 2026-05-20
**Deciders**: Founder (Arian)
**Supersedes**: Earlier BSL-1.1 draft of this same ADR (rejected in favor of stricter internal-use posture)

## Context

Autopost is being productized as a hosted SaaS and as a source-available bundle deployable on Poukai-customer servers. Founder chose a stricter posture than BSL: license is grant-by-contract, not a public OSS license. Source is visible to paying customers within their own installation; not redistributable, not modifiable for resale, not usable by non-customers. Same posture applies to `@poukai-inc/ui` since it ships as part of every autopost install.

## Decision

`autopost` and `@poukai-inc/ui` are both licensed under a **custom Poukai Internal-Use License v1.0 (PIUL-1.0)**. Use is granted only to organizations under an active Poukai customer agreement. Source is available within the licensed deployment. No public open-source license applies.

Package metadata uses `"license": "SEE LICENSE IN LICENSE"` (SPDX-recognized pointer to a custom license file). Both repos ship the same `LICENSE` text.

**This is a template pending legal counsel review before first client distribution.** The text in `LICENSE` is a placeholder drafted by engineering; it MUST be reviewed and signed off by a licensed attorney before being attached to any customer agreement or shipped in any artifact distributed outside Poukai.

## Rationale

- **Maximum commercial control**: Every customer relationship is governed by Poukai's own contract — license terminates if customer ceases to be a Poukai customer. No public-domain leakage, no fork risk, no "change date" giveaway.
- **Source-available preserves trust**: Customers can audit the code they're running (compliance, security review, debugging), which BSL also offers — but PIUL keeps the redistribution restriction permanent rather than time-limited.
- **DS bundled under same grant**: `@poukai-inc/ui` ships as a transitive dependency in every install; a permissive DS license (MIT) would let customers extract and republish the DS independently, fragmenting the brand. Same license on both keeps the boundary clean.
- **Aligns with founder's "Just Poukai AI" posture**: Software is part of the service Poukai sells; customers buy access to the running system + the source as part of trust-building, not a standalone OSS product.
- **npm + tooling compatible**: `"SEE LICENSE IN LICENSE"` is an SPDX-recognized identifier; npm and license-check tooling accept it (vs `UNLICENSED` which blocks some scanners).

## Alternatives considered

| Option | Why not |
|---|---|
| BSL 1.1 (autopost) + MIT (DS) | Earlier choice (now superseded). Public OSS posture conflicts with founder's "internal-use only" direction. 4-year change date eventually gives the moat away. |
| Pure proprietary closed-source (no source access) | Removes customer audit ability; breaks the trust-via-transparency posture; harder to debug at customer sites. |
| MIT for both | Zero moat; anyone can fork and republish. Contradicts decision direction. |
| AGPL-3.0 | Source-share obligation triggers for any customer using autopost in a larger system; scares enterprise legal; doesn't restrict commercial competition the way intended. |
| Elastic License v2 (ELv2) | Permits any non-managed-service use including non-customers; broader than intended. |
| Custom EULA without source-available | Loses the trust-through-transparency benefit and breaks customer audit workflows. |

## Consequences

**Positive**:
- Strongest commercial moat: license terminates with customer relationship, no public reuse
- Customer trust via source-available auditability is preserved
- Brand integrity preserved (DS cannot be extracted and republished under permissive license)
- No "open source contributor" overhead — no governance, no public PRs to manage, no community

**Negative**:
- **Requires legal counsel review** before first client distribution; engineering-drafted LICENSE template is a placeholder, not legally vetted
- Custom EULA = higher friction in client-legal review than a standard SPDX license
- Some developer candidates may decline employment if they prefer working on OSS
- Cannot accept external open-source contributions without contributor license assignment (CLA) — adds process if external help is ever wanted
- npm `license-check` allowlist gates (Poukai R-064) treat `SEE LICENSE IN LICENSE` as non-standard; may need allowlist override in CI

**Follow-ups**:
- **HARD BLOCKER**: Engage legal counsel to review/redraft `LICENSE` text before first client install
- PR in `poukai-inc/poukai-ui` to:
  - Replace `"license": "UNLICENSED"` with `"license": "SEE LICENSE IN LICENSE"` in `package.json`
  - Add identical `LICENSE` file to repo root
- Update `MIGRATION_ANALYSIS.md` §7 + `BACKLOG.md` references to BSL — supersede with this decision
- Update R-064 license-check CI gate config to accept `SEE LICENSE IN LICENSE` for first-party Poukai packages while still rejecting it for transitive deps
- Draft a Customer Agreement template (separate from LICENSE) that grants the actual usage rights per customer
- Decide CLA policy if external contributions are ever opened (default: no external contributions)

## References

- `MIGRATION_ANALYSIS.md` §7 (Licensing — to be revised to match this decision)
- `LICENSE` (Poukai Internal-Use License v1.0 — template, pending counsel review)
- https://spdx.dev/learn/handling-license-info/ — `SEE LICENSE IN LICENSE` convention
- https://docs.npmjs.com/cli/v10/configuring-npm/package-json#license — npm license field docs

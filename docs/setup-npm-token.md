# NPM_TOKEN — one-time setup for `@poukai-inc/*` packages

`@poukai-inc/*` packages publish to **GitHub Packages** (`npm.pkg.github.com`) as a restricted scope. Anyone installing them needs a token with `read:packages` scope.

This guide covers four contexts: **local dev**, **GitHub Actions (autopost CI)**, **Vercel (autopost prod build)**, and **Renovate (Mend dashboard)**.

---

## 1. Create the token (one-time)

1. Go to https://github.com/settings/tokens/new (or fine-grained: `/settings/personal-access-tokens/new`).
2. Scope: **`read:packages`** (minimum). For users who also publish to GitHub Packages, add `write:packages`.
3. Expiration: 90 days minimum, rotate quarterly. Use a calendar reminder.
4. Copy the token (`ghp_…`). It is shown only once.

For a fine-grained PAT instead:
- Resource owner: `poukai-inc`
- Repository access: `poukai-inc/poukai-ui` (and any other repos under the org that publish packages)
- Permissions: **Packages → Read**

---

## 2. Local dev

Add to your shell rc (`~/.zshrc`, `~/.bashrc`):

```bash
export NPM_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Then in a new shell:

```bash
cd autopost
pnpm install
```

`.npmrc` references `${NPM_TOKEN}` — pnpm/npm interpolates it from env at install time.

---

## 3. GitHub Actions (autopost CI)

1. Repo Settings → Secrets and variables → Actions → **New repository secret**.
2. Name: `NPM_TOKEN`
3. Value: paste the PAT.
4. Every workflow job that runs `pnpm install` must expose the secret:

```yaml
- run: pnpm install --frozen-lockfile
  env:
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

(The autopost `ci.yml` is already wired this way.)

---

## 4. Vercel (autopost prod build)

1. Vercel project → Settings → Environment Variables.
2. Name: `NPM_TOKEN`
3. Value: paste the PAT.
4. Environments: **Production**, **Preview**, **Development**.
5. Vercel runs `pnpm install` during build with this env present.

---

## 5. Renovate / Mend

If using Mend's hosted Renovate (`renovate[bot]`):

1. https://developer.mend.io → Sign in → Select `poukai-inc` org.
2. Settings → Credentials → **Add credential**.
3. Type: `npm`
4. Host: `npm.pkg.github.com`
5. Token: paste the PAT.

The `.github/renovate.json` already declares the host rule; Mend pulls the token from credentials at PR-creation time.

If running self-hosted Renovate, set `RENOVATE_NPM_TOKEN` (or use the same host rule with `encrypted.token` produced via `https://app.renovatebot.com/encrypt`).

---

## Rotation

Set a calendar reminder to rotate the token every 90 days.

Procedure:
1. Generate a new PAT (Section 1).
2. Update local env, GitHub Actions secret, Vercel env, Renovate credential.
3. Revoke the old PAT at https://github.com/settings/tokens.
4. Watch for build failures on the next CI run as a backstop.

---

## Troubleshooting

**`401 Unauthorized` from `npm.pkg.github.com`:**
- Token missing or expired. Confirm `echo $NPM_TOKEN | head -c 8` returns a value locally.
- Token missing `read:packages` scope.
- Fine-grained PAT not granted access to `poukai-inc/poukai-ui`.

**`404 Not Found` for `@poukai-inc/ui`:**
- Token has `read:packages` but the publishing repo (`poukai-inc/poukai-ui`) hasn't published the version yet, or the package visibility is set to private and your user account doesn't have read access.

**Renovate not opening bump PRs for `@poukai-inc/ui`:**
- Renovate credential for `npm.pkg.github.com` missing in Mend.
- `prCreation: immediate` and `schedule: at any time` are set for this scope (see `.github/renovate.json`); if neither fire, the credential is the most likely cause.

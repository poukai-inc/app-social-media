#!/usr/bin/env node
/**
 * License allowlist enforcer — Poukai R-064.
 *
 * Runs `pnpm licenses list --json --prod` and fails if any production
 * dependency declares a license outside the allowlist.
 *
 * First-party Poukai packages may declare `SEE LICENSE IN LICENSE`
 * (per decisions/0001-licensing.md, PIUL-1.0). All other packages must
 * be MIT, Apache-2.0, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD, CC0-1.0,
 * or Unlicense.
 */

import { execSync } from 'node:child_process';

const ALLOWED_LICENSES = new Set([
  'MIT',
  'Apache-2.0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'CC0-1.0',
  'CC-BY-4.0',     // attribution-only (used by caniuse-lite via browserslist)
  'Unlicense',
  'BlueOak-1.0.0', // permissive, used by some npm packages
  'Python-2.0',    // permissive, used by some tooling
]);

// Special: first-party packages may use this opaque pointer per Poukai PIUL-1.0.
// `UNLICENSED` is also accepted for first-party as a transitional state until the
// DS republishes with the correct `SEE LICENSE IN LICENSE` string — tracked in
// poukai-inc/poukai-ui#144. DO NOT add `UNLICENSED` to ALLOWED_LICENSES — it
// must stay scoped to first-party prefixes. Remove this acceptance after the DS
// republishes and `autopost/package.json` bumps to the patched version.
const FIRST_PARTY_OPAQUE = 'SEE LICENSE IN LICENSE';
const FIRST_PARTY_ACCEPTED = new Set([FIRST_PARTY_OPAQUE, 'UNLICENSED']);
const FIRST_PARTY_PREFIXES = ['@poukai-inc/'];

// Per-package exceptions: pkg name (prefix-matched) → allowed license.
// Use sparingly + document the rationale inline.
const PACKAGE_EXCEPTIONS = [
  // sharp's libvips binary is LGPL-3.0-or-later. Dynamically linked per LGPL §6;
  // platform-specific (one of @img/sharp-libvips-{darwin-arm64,linux-x64,...}
  // installs per host). Compatible with PIUL-1.0 redistribution.
  { prefix: '@img/sharp-libvips-', license: 'LGPL-3.0-or-later' },
];

function normalizeLicense(raw) {
  if (!raw) return null;
  // Strip wrappers like "(MIT)" or "(MIT OR Apache-2.0)".
  const cleaned = String(raw).replace(/^\(|\)$/g, '').trim();
  // Pick the first license in an SPDX OR expression — if any branch is allowed, we accept.
  return cleaned.split(/\s+OR\s+/i).map((s) => s.trim());
}

function isAllowed(license, pkgName) {
  if (FIRST_PARTY_ACCEPTED.has(license)) {
    return FIRST_PARTY_PREFIXES.some((p) => pkgName.startsWith(p));
  }
  if (ALLOWED_LICENSES.has(license)) return true;
  return PACKAGE_EXCEPTIONS.some(
    (e) => pkgName.startsWith(e.prefix) && license === e.license,
  );
}

function main() {
  let raw;
  try {
    raw = execSync('pnpm licenses list --prod --json', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    console.error('Failed to run `pnpm licenses list`:', err.message);
    process.exit(1);
  }

  let licenses;
  try {
    licenses = JSON.parse(raw);
  } catch {
    console.error('Could not parse `pnpm licenses list` JSON output.');
    process.exit(1);
  }

  const violations = [];

  for (const [licenseName, packages] of Object.entries(licenses)) {
    const branches = normalizeLicense(licenseName) ?? [licenseName];
    for (const pkg of packages) {
      const pkgName = pkg.name || '(unknown)';
      const accepted = branches.some((branch) => isAllowed(branch, pkgName));
      if (!accepted) {
        violations.push({ pkg: pkgName, version: pkg.version, license: licenseName });
      }
    }
  }

  if (violations.length === 0) {
    console.log(`License allowlist check passed (${Object.keys(licenses).length} license bucket(s) reviewed).`);
    process.exit(0);
  }

  console.error(`License allowlist VIOLATIONS (${violations.length}):`);
  console.error('Allowed: ' + [...ALLOWED_LICENSES].sort().join(', '));
  console.error(`Plus ${[...FIRST_PARTY_ACCEPTED].map((s) => `'${s}'`).join(' or ')} for first-party (${FIRST_PARTY_PREFIXES.join(', ')}).`);
  console.error('');
  for (const v of violations) {
    console.error(`  - ${v.pkg}@${v.version} → ${v.license}`);
  }
  process.exit(1);
}

main();

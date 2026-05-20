import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * autopost ESLint flat config.
 *
 * Layers (last wins):
 *   1. next/core-web-vitals — Next-specific rules + perf hygiene.
 *                             Registers jsx-a11y plugin with baseline
 *                             rules (alt-text, anchor-is-valid, etc.).
 *   2. next/typescript      — @typescript-eslint + Next TS rules
 *   3. autopost overrides   — Poukai R-073 (no-console), R-074 type imports,
 *                             unused-vars strict, no-debugger
 *
 * Mirrors poukai-ui patterns (consistent-type-imports, _-prefix unused).
 *
 * NOTE: Full jsx-a11y/recommended (Poukai R-024..R-033) is NOT layered on top.
 * ESLint flat config requires plugin-scoped rules to be co-located with the
 * plugin's `plugins:` declaration; next/core-web-vitals already owns that
 * block. To tighten beyond the next/core-web-vitals baseline we'd need to
 * either (a) fork next-config-vitals, or (b) add a config block that
 * re-declares the plugin under an alias. Tracked in BACKLOG as a follow-up.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Poukai R-073 — no console.log / debugger in merged code.
      "no-console": "error",
      "no-debugger": "error",

      // Poukai-ui parity — explicit type-only imports.
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],

      // Tighter unused vars: errors with _-prefix escape hatch (matches poukai-ui).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // CLI scripts and dev tooling — console output is the contract.
    files: [
      ".github/scripts/**/*.{mjs,js,ts}",
      "scripts/**/*.{mjs,cjs,js,ts}",
      "*.config.{mjs,js,ts}",
    ],
    rules: {
      "no-console": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "dist/**",
    "node_modules/**",
  ]),
]);

export default eslintConfig;

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Not source. `public/red-bull-game/` is a vendored static build (minified
    // React UMD bundles + a generated game bundle) and accounts for 3 errors
    // and 551 warnings on its own; nothing under `public/` is ours to lint.
    "public/**",
    "coverage/**",
    ".ui-backups/**",
  ]),
  {
    // ─── Known debt ratchet ──────────────────────────────────────────────
    // These six React Compiler rules ship as errors in eslint-config-next.
    // Clearing them means restructuring client components (lifting state out
    // of effects, hoisting component definitions out of render, reworking
    // memo dependencies and ref access) — that is tracked separately under
    // the audit's *performance* and *structure* themes, not under the
    // quality-gate work (shared-infra-23 / shared-infra-27).
    //
    // Downgraded to 'warn' so CI can block on real errors today while these
    // stay visible in every lint run. They are deliberately NOT disabled.
    // Re-promote each one to 'error' as its theme lands.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  // Must stay LAST: turns off every stylistic rule that would fight Prettier.
  prettier,
]);

export default eslintConfig;

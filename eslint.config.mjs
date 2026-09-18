import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
    // Agent worktrees (see docs/NOW-ROADMAP-BRIEF.md) — never lint those.
    ".claude/**",
    // Design handoff bundles (docs/design/*/BRIEF.md D8): the .dc.html pages
    // ship their own plain-JS runtime, which is reference material, not code.
    "docs/design/**",
    // Playwright's output (gitignored): the HTML report and traces carry
    // minified JS that `npm run lint` would otherwise flag by the thousand
    // after any local `npm run test:e2e`.
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;

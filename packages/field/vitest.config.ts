import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // jsdom so the hooks in this package (use-sync-queue and friends) can be executed at all —
    // they sit in the coverage-gated layer while a node environment made them untestable.
    environment: "jsdom",
    // Feeds the repo-wide coverage gate (scripts/coverage-check.mjs). `all: true` forces every
    // source file into the report even with no test, so new untested files read as all-missed.
    coverage: {
      provider: "v8",
      all: true,
      // Logic layer only (see admin/vitest.config.ts for the rationale). React components
      // and screens are e2e territory, not vitest units.
      include: ["src/lib/**/*.ts", "src/lib/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.d.ts"],
      reporter: ["lcov", "json-summary", "text-summary"],
      reportsDirectory: "coverage",
    },
  },
});

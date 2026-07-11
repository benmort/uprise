import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Feeds the repo-wide coverage gate (scripts/coverage-check.mjs). `all: true` forces every
    // source file into the report even with no test, so untested files read as all-missed.
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts"],
      reporter: ["lcov", "json-summary", "text-summary"],
      reportsDirectory: "coverage",
    },
  },
});

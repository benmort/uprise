import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
    // Feeds the repo-wide coverage gate (scripts/coverage-check.mjs). `all: true` forces every
    // matched source file into the report even with no test, so untested files read as all-missed.
    coverage: {
      provider: "v8",
      all: true,
      // Pure logic only. src/main.ts and src/admin/queue-admin.ts are BullMQ/Redis/prisma
      // infra with top-level side effects (`void bootstrap()` / `void run()`); the unit-testable
      // logic lives in src/lib. Infra is e2e territory, not vitest units.
      include: ["src/lib/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.d.ts"],
      reporter: ["lcov", "json-summary", "text-summary"],
      reportsDirectory: "coverage",
    },
  },
});

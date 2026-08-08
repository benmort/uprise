import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // jsdom, not node: `src/lib` — the gated scope — contains React hooks (use-api, turf-basket,
    // geo-explorer-state, use-realtime-inbox, …). Under a node environment they were inside the
    // coverage gate while being impossible to execute, so they sat at 0% and held the package at
    // 48%. src/app and src/components remain e2e territory for JOURNEYS; this makes behaviour
    // reachable. See src/test/setup.ts for what is mocked and why.
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // Feeds the repo-wide coverage gate (scripts/coverage-check.mjs). `all: true` forces every
    // source file into the report even with no test, so new untested files read as all-missed
    // (0-hit) rather than absent – which is what keeps patch coverage honest.
    coverage: {
      provider: "v8",
      all: true,
      // The logic layer only. View code (src/app, src/components) is covered by Playwright
      // e2e (`pnpm --filter admin e2e`), not vitest units – gating it here would force the gate
      // to be disabled. So "total %" here means logic coverage, and the patch floor bites the
      // code unit tests are the right tool for.
      include: ["src/lib/**/*.ts", "src/lib/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.d.ts"],
      reporter: ["lcov", "json-summary", "text-summary"],
      reportsDirectory: "coverage",
    },
  },
});

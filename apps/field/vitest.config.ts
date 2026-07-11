import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/middleware.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.d.ts"],
      reporter: ["lcov", "json-summary", "text-summary"],
      reportsDirectory: "coverage",
    },
  },
});

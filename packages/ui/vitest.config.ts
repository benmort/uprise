import { defineConfig } from "vitest/config";

// The design system is source-consumed and mostly React (e2e territory). This runner exists
// for the package's pure logic utilities (e.g. brand-css) — node env, no DOM, no coverage gate.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

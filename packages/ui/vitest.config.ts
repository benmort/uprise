import { defineConfig } from "vitest/config";

// The design system is source-consumed. This runner covers the package's pure logic utilities
// (e.g. brand-css) AND component BEHAVIOUR — what a control does, not how it looks. Journeys
// remain e2e's job. jsdom because a component that cannot be rendered cannot be tested: OtpInput's
// onComplete was dead code (`!joined.includes("")` is always false) and nothing caught it.
export default defineConfig({
  test: {
    // .tsx too: the design system's components are now testable for BEHAVIOUR (not markup) —
    // OtpInput's onComplete could never fire, and nothing caught it.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
});

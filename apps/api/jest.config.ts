import type { Config } from "jest";

const config: Config = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  // Coverage is the substrate for the repo-wide coverage gate (scripts/coverage-check.mjs):
  // lcov.info feeds patch coverage (per-line hits on changed lines), coverage-summary.json
  // feeds the no-regression check (total line %). `collectCoverageFrom` forces every source
  // file into the report even with no test, so a brand-new untested file shows as all-missed
  // (0-hit DA lines) rather than silently absent — which is what makes patch coverage honest.
  collectCoverageFrom: ["src/**/*.ts"],
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "\\.spec\\.ts$",
    "<rootDir>/src/scripts/", // one-off ts-node scripts (seeds, backfills, geo) – not unit-tested
    "<rootDir>/src/main.ts", // bootstrap entrypoint
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["lcov", "json-summary", "text-summary"],
  testEnvironment: "node",
};

export default config;

import type { Config } from "jest";

/**
 * E2E jest config — boots the real Nest app (AppModule) against the local Postgres
 * + Redis and drives it over HTTP with supertest. Kept separate from the unit
 * `jest.config.ts` (which matches *.spec.ts) so `npm test` stays fast and DB-free.
 * Run: npm --prefix apps/api run test:e2e  (needs local Postgres + Redis + .env).
 */
const config: Config = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: ".*\\.e2e-spec\\.ts$",
  transform: { "^.+\\.ts$": "ts-jest" },
  testEnvironment: "node",
  testTimeout: 120000,
};

export default config;

import { databaseHost, looksLikeProduction, resolveSeedAction } from "./seed-demo.guard";

const LOCAL = { DATABASE_URL: "postgresql://user:pw@localhost:5432/uprise" };
const PROD = { DATABASE_URL: "postgresql://user:pw@ep-cool-name-123.ap-southeast-2.aws.neon.tech/uprise" };

describe("seed-demo guard", () => {
  describe("databaseHost", () => {
    it("extracts the host from a connection url", () => {
      expect(databaseHost(LOCAL.DATABASE_URL)).toBe("localhost");
      expect(databaseHost(PROD.DATABASE_URL)).toBe("ep-cool-name-123.ap-southeast-2.aws.neon.tech");
    });

    it("returns null rather than throwing on junk", () => {
      expect(databaseHost(undefined)).toBeNull();
      expect(databaseHost("")).toBeNull();
      expect(databaseHost("not a url")).toBeNull();
    });
  });

  describe("looksLikeProduction", () => {
    it("treats recognised local hosts as safe", () => {
      expect(looksLikeProduction(LOCAL)).toBe(false);
      expect(looksLikeProduction({ DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/db" })).toBe(false);
    });

    it("treats a remote host as production", () => {
      expect(looksLikeProduction(PROD)).toBe(true);
    });

    it("treats NODE_ENV=production as production even on a local host", () => {
      expect(looksLikeProduction({ ...LOCAL, NODE_ENV: "production" })).toBe(true);
    });

    it("fails safe when the target cannot be determined", () => {
      // "I couldn't tell" must never authorise a destructive delete.
      expect(looksLikeProduction({})).toBe(true);
      expect(looksLikeProduction({ DATABASE_URL: "garbage" })).toBe(true);
    });
  });

  describe("resolveSeedAction", () => {
    it("seeds without --clear, whatever the target — seedDemo is additive", () => {
      expect(resolveSeedAction([], PROD)).toEqual({ action: "seed" });
      expect(resolveSeedAction(["node", "seed-demo.ts"], LOCAL)).toEqual({ action: "seed" });
    });

    it("clears freely against a local database", () => {
      expect(resolveSeedAction(["--clear"], LOCAL)).toEqual({ action: "clear" });
    });

    it("refuses to clear a production-looking database", () => {
      const decision = resolveSeedAction(["--clear"], PROD);
      expect(decision.action).toBe("refuse");
      // The message must name the host, so the operator can see what they nearly wiped.
      if (decision.action === "refuse") {
        expect(decision.reason).toContain("ep-cool-name-123.ap-southeast-2.aws.neon.tech");
      }
    });

    it("allows an explicitly forced production clear", () => {
      expect(resolveSeedAction(["--clear", "--force"], PROD)).toEqual({ action: "clear" });
    });

    it("does not let --force alone imply a clear", () => {
      expect(resolveSeedAction(["--force"], PROD)).toEqual({ action: "seed" });
    });
  });
});

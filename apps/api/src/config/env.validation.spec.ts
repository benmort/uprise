import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateEnv } from "./env.validation";

/** Everything validateEnv genuinely requires, so a test varies only what it means to. */
const requiredEnv = (): Record<string, string> => ({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://localhost:5432/uprise",
  JWT_SECRET: "a".repeat(32),
  INTEGRATION_CREDENTIAL_SECRET: "b".repeat(32),
  API_BASE_URL: "http://localhost:3001",
  BASIC_AUTH_USERNAME: "dev",
  BASIC_AUTH_PASSWORD: "dev",
  TWILIO_ACCOUNT_SID: "AC00000000000000000000000000000000",
  TWILIO_AUTH_TOKEN: "token",
  TWILIO_PHONE_NUMBER: "+61400000000",
});

/**
 * Integration credentials must not be boot requirements.
 *
 * ACTION_NETWORK_API_KEY used to be `required()`, so the API could not start without a
 * live Action Network key sitting in env — and because the integrations read path fell
 * back to it, that one key became every tenant's credential. Credentials are per-tenant
 * now (integration.IntegrationConnection); these tests stop the env var creeping back
 * into the boot contract.
 */
describe("validateEnv — integration credentials are not boot requirements", () => {
  const baseEnv = requiredEnv;

  function validate(env: Record<string, string | undefined>) {
    try {
      return { ok: true as const, value: validateEnv(env as never) };
    } catch (err) {
      return { ok: false as const, message: String(err) };
    }
  }

  it("boots with no Action Network or internal-source credentials at all", () => {
    const res = validate(baseEnv());
    if (!res.ok) {
      // Surface which var is still required — that is the actionable detail.
      expect(res.message).toBe("");
    }
    expect(res.ok).toBe(true);
  });

  it("does not name the integration keys among any remaining boot errors", () => {
    const res = validate({});
    // {} is missing genuinely-required vars, so this may fail — but never because of these.
    if (!res.ok) {
      expect(res.message).not.toContain("ACTION_NETWORK_API_KEY is required");
      expect(res.message).not.toContain("INTERNAL_SOURCE_API_KEY is required");
      expect(res.message).not.toContain("INTERNAL_SOURCE_API_BASE_URL is required");
    }
  });

  it("leaves the integration keys empty rather than inventing a value", () => {
    const res = validate(baseEnv());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.ACTION_NETWORK_API_KEY).toBe("");
      expect(res.value.INTERNAL_SOURCE_API_KEY).toBe("");
      expect(res.value.INTERNAL_SOURCE_API_BASE_URL).toBe("");
    }
  });

  it("still defaults the public Action Network base URL", () => {
    const res = validate(baseEnv());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.ACTION_NETWORK_API_BASE_URL).toBe("https://actionnetwork.org/api/v2");
    }
  });

  it("passes a supplied key through untouched when one is set", () => {
    const res = validate({ ...baseEnv(), ACTION_NETWORK_API_KEY: "  legacy-value  " });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.ACTION_NETWORK_API_KEY).toBe("legacy-value");
  });
});

/**
 * The committed .env.example files are copied verbatim by anyone setting up dev, so a
 * value that fails validation there is a broken onboarding path. ACTION_NETWORK_SYNC_PER_PAGE
 * shipped as 95 against a validated max of 25 (Action Network 403s above 25), and
 * REQUESTS_PER_SECOND as 190 against a documented limit of 4.
 */
describe("validateEnv — the committed .env.example values validate", () => {
  const APPS_DIR = resolve(__dirname, "../../..");
  const EXAMPLES = ["api/.env.example", "worker/.env.example"];

  /** Every KEY=value line with a non-blank value, as validateEnv would see it. */
  function parseEnvFile(path: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match && match[2].trim()) out[match[1]] = match[2].trim();
    }
    return out;
  }

  it.each(EXAMPLES)("apps/%s parses cleanly", (relativePath) => {
    const env = { ...requiredEnv(), ...parseEnvFile(resolve(APPS_DIR, relativePath)) };
    expect(() => validateEnv(env as never)).not.toThrow();
  });
});

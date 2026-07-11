import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { authAppUrl, adminAppUrl } from "./links";

// links.ts resolves an app origin from (1) a runtime-injected `window.__*__`
// override, (2) a build-time `NEXT_PUBLIC_*` env var, then (3) a localhost
// default. The precedence and the exact fallbacks are load-bearing — the SSO
// hub and the organiser app must be addressed correctly per environment — so
// each branch is asserted independently.

const AUTH_ENV = "NEXT_PUBLIC_AUTH_APP_URL";
const APP_ENV = "NEXT_PUBLIC_APP_URL";

describe("links — authAppUrl / adminAppUrl origin resolution", () => {
  const savedAuthEnv = process.env[AUTH_ENV];
  const savedAppEnv = process.env[APP_ENV];

  beforeEach(() => {
    delete process.env[AUTH_ENV];
    delete process.env[APP_ENV];
    // Ensure no leaked `window` from a prior test — node env has none by default.
    delete (globalThis as { window?: unknown }).window;
  });

  afterEach(() => {
    if (savedAuthEnv === undefined) delete process.env[AUTH_ENV];
    else process.env[AUTH_ENV] = savedAuthEnv;
    if (savedAppEnv === undefined) delete process.env[APP_ENV];
    else process.env[APP_ENV] = savedAppEnv;
    delete (globalThis as { window?: unknown }).window;
  });

  it("falls back to the localhost defaults when neither window nor env is set", () => {
    expect(authAppUrl()).toBe("http://localhost:3002");
    expect(adminAppUrl()).toBe("http://localhost:3000");
  });

  it("prefers the build-time NEXT_PUBLIC_* env var over the default", () => {
    process.env[AUTH_ENV] = "https://auth.example.org";
    process.env[APP_ENV] = "https://app.example.org";
    expect(authAppUrl()).toBe("https://auth.example.org");
    expect(adminAppUrl()).toBe("https://app.example.org");
  });

  it("prefers the runtime window.__*__ override above everything else", () => {
    process.env[AUTH_ENV] = "https://auth.env.org";
    process.env[APP_ENV] = "https://app.env.org";
    (globalThis as { window?: unknown }).window = {
      __AUTH_APP_URL__: "https://auth.runtime.org",
      __APP_URL__: "https://app.runtime.org",
    };
    expect(authAppUrl()).toBe("https://auth.runtime.org");
    expect(adminAppUrl()).toBe("https://app.runtime.org");
  });

  it("ignores an empty runtime override and falls through to env, then default", () => {
    // window exists but the injected value is empty — the `if (runtime)` guard
    // must reject it and continue down the chain rather than return "".
    (globalThis as { window?: unknown }).window = {
      __AUTH_APP_URL__: "",
      __APP_URL__: "",
    };
    process.env[AUTH_ENV] = "https://auth.env-only.org";
    expect(authAppUrl()).toBe("https://auth.env-only.org");
    // No APP env set → default localhost, proving the full fall-through.
    expect(adminAppUrl()).toBe("http://localhost:3000");
  });
});

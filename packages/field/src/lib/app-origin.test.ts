import { describe, expect, it } from "vitest";
import { adminOrigin, adminOriginFor, DEV_ADMIN_PORT } from "./app-origin";

/**
 * This is the "Compose a new blast" link out of the texting screens. It is derived from the
 * host rather than configured, so every host shape the field app is served from has to land
 * somewhere real — a wrong answer here sends an organiser to a domain we do not own, or to a
 * port on their own machine.
 */
describe("adminOriginFor", () => {
  it("swaps the field label for admin on the platform hosts", () => {
    expect(adminOriginFor("field.uprise.org.au", "https:")).toBe("https://admin.uprise.org.au");
    expect(adminOriginFor("field.dev.uprise.org.au", "https:")).toBe(
      "https://admin.dev.uprise.org.au",
    );
  });

  it("stays inside a tenant's own domain", () => {
    // Cross-parent would mean no session cookie, so this is the difference between a working
    // link and a login bounce.
    expect(adminOriginFor("field.commonthreads.org.au", "https:")).toBe(
      "https://admin.commonthreads.org.au",
    );
  });

  it("resolves a bare tenant subdomain to the platform admin host", () => {
    // `<tenant>.uprise.org.au` IS the admin app; the parent is the platform root.
    expect(adminOriginFor("common-threads.uprise.org.au", "https:")).toBe(
      "https://admin.uprise.org.au",
    );
  });

  /**
   * Regression. `parts[0] = "admin"` turned an apex into `admin.org.au` — a public suffix,
   * nobody's app — and the same blind swap mangled every shape without a leading app label.
   */
  it("never produces a public-suffix or lookalike origin", () => {
    for (const host of ["uprise.org.au", "org.au", "au", "commonthreads.org.au"]) {
      const origin = adminOriginFor(host, "https:");
      expect(origin, host).not.toMatch(/admin\.(org|com|net)\.au/);
      expect(origin, host).not.toBe("https://admin.au");
    }
  });

  /**
   * Regression. The old form dropped the port entirely, so a dev canvasser on
   * `field.lvh.me:3005` was sent to `admin.lvh.me` — nothing listening, and no clue why.
   */
  it("keeps the dev port, and the parent that carries the session cookie", () => {
    expect(adminOriginFor("field.lvh.me:3005", "http:")).toBe(
      `http://admin.lvh.me:${DEV_ADMIN_PORT}`,
    );
    // The cookie is scoped to `.lvh.me`, so dropping to bare localhost would lose the session.
    expect(adminOriginFor("field.lvh.me:3005", "http:")).toContain("lvh.me");
  });

  it("falls back to localhost where there is no parent to keep", () => {
    for (const host of ["localhost:3005", "localhost", "127.0.0.1:3005"]) {
      expect(adminOriginFor(host, "http:"), host).toBe(`http://localhost:${DEV_ADMIN_PORT}`);
    }
  });

  it("normalises the protocol and tolerates a trailing-dot host", () => {
    expect(adminOriginFor("field.uprise.org.au", "https")).toBe("https://admin.uprise.org.au");
    expect(adminOriginFor("field.uprise.org.au.", "https:")).toBe("https://admin.uprise.org.au");
  });

  it("always returns an absolute origin with no trailing slash or path", () => {
    for (const host of [
      "field.uprise.org.au",
      "field.commonthreads.org.au",
      "common-threads.uprise.org.au",
      "field.lvh.me:3005",
      "localhost:3005",
      "uprise.org.au",
      "",
    ]) {
      const origin = adminOriginFor(host, "https:");
      expect(origin, host).toMatch(/^https?:\/\/[^/]+$/);
    }
  });
});

/**
 * The window-bound wrapper. The vitest environment is `node`, so there is no `window` unless
 * a test installs one — which makes the SSR branch the default case rather than a contrivance.
 */
describe("adminOrigin", () => {
  /** Run `fn` with a stubbed `window.location`, then restore whatever was there. */
  function withLocation<T>(host: string, protocol: string, fn: () => T): T {
    const g = globalThis as unknown as { window?: unknown };
    const had = "window" in g;
    const prev = g.window;
    g.window = { location: { host, protocol } };
    try {
      return fn();
    } finally {
      if (had) g.window = prev;
      else delete g.window;
    }
  }

  it("returns empty during SSR, where there is no host to derive from", () => {
    // The caller renders `${adminOrigin()}/channels/text`, and this link sits behind a click
    // so it never reaches the server render — but returning a guess would be worse than "".
    expect(adminOrigin()).toBe("");
  });

  it("derives from the live location on the platform and on a tenant's domain", () => {
    expect(withLocation("field.uprise.org.au", "https:", adminOrigin)).toBe(
      "https://admin.uprise.org.au",
    );
    expect(withLocation("field.commonthreads.org.au", "https:", adminOrigin)).toBe(
      "https://admin.commonthreads.org.au",
    );
  });

  it("carries the live protocol and port through to the dev fallback", () => {
    expect(withLocation("field.lvh.me:3005", "http:", adminOrigin)).toBe(
      `http://admin.lvh.me:${DEV_ADMIN_PORT}`,
    );
  });
});

describe("adminOriginFor — shape guarantee", () => {
  it("returns an absolute origin for every host shape", () => {
    for (const host of [
      "field.uprise.org.au",
      "field.commonthreads.org.au",
      "common-threads.uprise.org.au",
      "field.lvh.me:3005",
      "localhost:3005",
      "uprise.org.au",
      "",
    ]) {
      const origin = adminOriginFor(host, "https:");
      expect(origin, host).toMatch(/^https?:\/\/[^/]+$/);
    }
  });
});

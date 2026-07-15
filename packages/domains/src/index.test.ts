import { describe, expect, it } from "vitest";
import {
  RESERVED_APP_SUBDOMAINS,
  DEFAULT_PLATFORM_ROOTS,
  stripPort,
  hostIsLocal,
  hostHasNonDefaultPort,
  isDerivableHost,
  parentDomain,
  tenantSlugFromPlatformHost,
  isPlatformAppHost,
  siblingOrigin,
} from "./index";

describe("stripPort", () => {
  it("drops the port, trims and lowercases", () => {
    expect(stripPort("Admin.Uprise.Org.Au:3000")).toBe("admin.uprise.org.au");
    expect(stripPort("  common-threads.uprise.org.au ")).toBe("common-threads.uprise.org.au");
    expect(stripPort("")).toBe("");
  });
});

describe("hostIsLocal", () => {
  it("is true for localhost and bare IPv4", () => {
    expect(hostIsLocal("localhost")).toBe(true);
    expect(hostIsLocal("localhost:3000")).toBe(true);
    expect(hostIsLocal("127.0.0.1")).toBe(true);
    expect(hostIsLocal("10.0.0.5:3001")).toBe(true);
  });
  it("is false for real hosts", () => {
    expect(hostIsLocal("admin.uprise.org.au")).toBe(false);
    expect(hostIsLocal("lvh.me")).toBe(false);
  });
});

describe("hostHasNonDefaultPort / isDerivableHost", () => {
  it("flags non-default ports only", () => {
    expect(hostHasNonDefaultPort("admin.lvh.me:3002")).toBe(true);
    expect(hostHasNonDefaultPort("admin.uprise.org.au:443")).toBe(false);
    expect(hostHasNonDefaultPort("admin.uprise.org.au:80")).toBe(false);
    expect(hostHasNonDefaultPort("admin.uprise.org.au")).toBe(false);
  });
  it("derivable only when portless (or :80/:443) and non-local", () => {
    expect(isDerivableHost("admin.commonthreads.org.au")).toBe(true);
    expect(isDerivableHost("admin.uprise.org.au:443")).toBe(true);
    expect(isDerivableHost("admin.lvh.me:3002")).toBe(false); // dev port
    expect(isDerivableHost("localhost:3000")).toBe(false);
  });
});

describe("parentDomain", () => {
  it("resolves app-subdomain hosts (platform + white-label) to their parent", () => {
    expect(parentDomain("admin.uprise.org.au")).toBe("uprise.org.au");
    expect(parentDomain("auth.uprise.org.au")).toBe("uprise.org.au");
    expect(parentDomain("admin.dev.uprise.org.au")).toBe("dev.uprise.org.au");
    expect(parentDomain("admin.commonthreads.org.au")).toBe("commonthreads.org.au");
    expect(parentDomain("api.commonthreads.org.au")).toBe("commonthreads.org.au");
  });
  it("resolves a bare tenant subdomain to the platform root", () => {
    expect(parentDomain("common-threads.uprise.org.au")).toBe("uprise.org.au");
    expect(parentDomain("common-threads.dev.uprise.org.au")).toBe("dev.uprise.org.au");
  });
  it("returns null for apex roots, local, bare labels and single-label parents", () => {
    expect(parentDomain("uprise.org.au")).toBeNull(); // apex marketing, not a tenant
    expect(parentDomain("localhost:3000")).toBeNull();
    expect(parentDomain("127.0.0.1")).toBeNull();
    expect(parentDomain("uprise")).toBeNull();
    expect(parentDomain("")).toBeNull();
    expect(parentDomain("admin.au")).toBeNull(); // never yield a public-suffix parent
  });
  it("honours a caller-supplied roots list (API single-root case)", () => {
    expect(parentDomain("common-threads.uprise.org.au", ["dev.uprise.org.au"])).toBeNull();
    expect(parentDomain("common-threads.dev.uprise.org.au", ["dev.uprise.org.au"])).toBe(
      "dev.uprise.org.au",
    );
  });
});

describe("tenantSlugFromPlatformHost", () => {
  it("extracts the slug from a bare platform subdomain", () => {
    expect(tenantSlugFromPlatformHost("common-threads.uprise.org.au")).toBe("common-threads");
    expect(tenantSlugFromPlatformHost("acme.dev.uprise.org.au")).toBe("acme");
  });
  it("returns null for reserved app labels, apex, and white-label hosts", () => {
    expect(tenantSlugFromPlatformHost("admin.uprise.org.au")).toBeNull();
    expect(tenantSlugFromPlatformHost("api.uprise.org.au")).toBeNull();
    expect(tenantSlugFromPlatformHost("uprise.org.au")).toBeNull();
    expect(tenantSlugFromPlatformHost("admin.commonthreads.org.au")).toBeNull(); // custom → unknowable
    expect(tenantSlugFromPlatformHost("localhost:3000")).toBeNull();
  });
  it("rejects malformed slug labels", () => {
    expect(tenantSlugFromPlatformHost("-bad.uprise.org.au")).toBeNull();
    expect(tenantSlugFromPlatformHost("bad-.uprise.org.au")).toBeNull();
  });
});

describe("isPlatformAppHost", () => {
  it("is true only for a reserved label on a platform root", () => {
    expect(isPlatformAppHost("admin.uprise.org.au")).toBe(true);
    expect(isPlatformAppHost("auth.dev.uprise.org.au")).toBe(true);
    expect(isPlatformAppHost("common-threads.uprise.org.au")).toBe(false);
    expect(isPlatformAppHost("admin.commonthreads.org.au")).toBe(false);
    expect(isPlatformAppHost("uprise.org.au")).toBe(false);
  });
});

describe("siblingOrigin", () => {
  it("derives the sibling app origin under the host's parent", () => {
    expect(siblingOrigin("admin.commonthreads.org.au", "auth")).toBe(
      "https://auth.commonthreads.org.au",
    );
    expect(siblingOrigin("admin.commonthreads.org.au", "api")).toBe(
      "https://api.commonthreads.org.au",
    );
    expect(siblingOrigin("common-threads.uprise.org.au", "auth")).toBe("https://auth.uprise.org.au");
    expect(siblingOrigin("admin.uprise.org.au", "field")).toBe("https://field.uprise.org.au");
  });
  it("normalises the protocol argument", () => {
    expect(siblingOrigin("admin.commonthreads.org.au", "auth", "https:")).toBe(
      "https://auth.commonthreads.org.au",
    );
  });
  it("returns null for dev/ported/local hosts so callers fall back to env", () => {
    expect(siblingOrigin("localhost:3000", "auth")).toBeNull();
    expect(siblingOrigin("admin.lvh.me:3002", "auth")).toBeNull();
    expect(siblingOrigin("uprise.org.au", "auth")).toBeNull();
  });
});

describe("catalogue constants", () => {
  it("reserves the uprise app labels (incl. action/field/labs) and lists the platform roots", () => {
    for (const label of ["admin", "auth", "api", "action", "field", "labs", "marketing"]) {
      expect(RESERVED_APP_SUBDOMAINS.has(label)).toBe(true);
    }
    expect(DEFAULT_PLATFORM_ROOTS).toContain("uprise.org.au");
  });

  it("reserves prog-parity infra labels so a tenant can't claim them as a subdomain", () => {
    for (const label of ["status", "billing", "docs", "staging", "blog", "shop"]) {
      expect(RESERVED_APP_SUBDOMAINS.has(label)).toBe(true);
      // …and such a host is not resolved as a tenant subdomain.
      expect(tenantSlugFromPlatformHost(`${label}.uprise.org.au`)).toBeNull();
    }
  });
});

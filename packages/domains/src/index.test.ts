import { describe, expect, it } from "vitest";
import {
  RESERVED_APP_SUBDOMAINS,
  DEFAULT_PLATFORM_ROOTS,
  stripPort,
  hostIsLocal,
  hostHasNonDefaultPort,
  isDerivableHost,
  isPublicSuffix,
  parentDomain,
  tenantSlugFromPlatformHost,
  isPlatformAppHost,
  isPlatformOwnedDomain,
  PLATFORM_OWNED_DOMAINS,
  isCustomParentHost,
  cookieDomainForHost,
  siblingOrigin,
} from "./index";

describe("stripPort", () => {
  it("drops the port, trims and lowercases", () => {
    expect(stripPort("Admin.Uprise.Org.Au:3000")).toBe("admin.uprise.org.au");
    expect(stripPort("  common-threads.uprise.org.au ")).toBe("common-threads.uprise.org.au");
    expect(stripPort("")).toBe("");
  });
  /**
   * Regression: a trailing-dot FQDN is a legal, routable host that reaches production today
   * (`https://admin.uprise.org.au./` answers). Leaving the dot on made the parent compute as
   * `uprise.org.au.`, which matches no roots entry, so every ownership check read a uprise
   * host as a stranger's — and `getApiUrl()` derived a CORS-rejected, cookieless origin.
   */
  it("strips a trailing FQDN dot", () => {
    expect(stripPort("admin.uprise.org.au.")).toBe("admin.uprise.org.au");
    expect(stripPort("Admin.Uprise.Org.Au.:443")).toBe("admin.uprise.org.au");
    expect(stripPort(" api.uprise.org.au. ")).toBe("api.uprise.org.au");
    expect(stripPort(".")).toBe("");
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
  /**
   * Regression: before the PUBLIC_SUFFIXES guard the only check was "the parent has ≥2
   * labels", so each of these yielded a public suffix — which would then become a cookie
   * Domain and a `siblingOrigin` host. Cheap to get wrong again, so pin every shape.
   */
  it("never yields a MULTI-label public suffix as the parent", () => {
    for (const host of [
      "admin.org.au",
      "admin.com.au",
      "admin.net.au",
      "admin.gov.au",
      "api.co.uk",
      "auth.co.nz",
      "field.com.br",
    ]) {
      expect(parentDomain(host)).toBeNull();
      expect(siblingOrigin(host, "auth")).toBeNull();
      expect(cookieDomainForHost(host)).toBe("");
    }
  });
  it("still resolves a real apex that merely SITS on a two-label suffix", () => {
    // The guard must reject the suffix itself without rejecting domains under it.
    expect(parentDomain("admin.commonthreads.org.au")).toBe("commonthreads.org.au");
    expect(parentDomain("admin.acme.com.au")).toBe("acme.com.au");
    expect(parentDomain("admin.example.co.uk")).toBe("example.co.uk");
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

describe("isPublicSuffix", () => {
  it("is true for bare labels and known multi-label suffixes", () => {
    expect(isPublicSuffix("au")).toBe(true);
    expect(isPublicSuffix("org.au")).toBe(true);
    expect(isPublicSuffix("com.au")).toBe(true);
    expect(isPublicSuffix("co.uk")).toBe(true);
  });
  it("is false for registrable domains and for empty input", () => {
    expect(isPublicSuffix("uprise.org.au")).toBe(false);
    expect(isPublicSuffix("commonthreads.org.au")).toBe(false);
    expect(isPublicSuffix("example.com")).toBe(false);
    expect(isPublicSuffix("")).toBe(false);
  });
});

describe("isCustomParentHost", () => {
  /**
   * This is the gate every Part B branch sits behind, so the important assertion is the
   * NEGATIVE one: it must be false for every host shape that exists today, or the new code
   * paths stop being unreachable in production.
   *
   * The first version of this table covered eleven shapes and was treated as proof the work
   * shipped dark. It wasn't — it only proved the cases I had thought of. Two live shapes
   * (trailing-dot FQDNs, `www.upriselabs.org`) defeated the gate and were caught by an
   * adversarial pass, not by this table. Hence the explicit allowlist, and hence the shapes
   * below being grouped by WHY they must be false rather than just listed.
   */
  it("is false for every host that exists today", () => {
    for (const host of [
      // platform app hosts
      "admin.uprise.org.au",
      "auth.uprise.org.au",
      "api.uprise.org.au",
      "action.uprise.org.au",
      "field.uprise.org.au",
      "admin.dev.uprise.org.au",
      // bare tenant subdomains
      "common-threads.uprise.org.au",
      "common-threads.dev.uprise.org.au",
      // apexes
      "uprise.org.au",
      "upriselabs.org",
      // local dev + non-routable
      "admin.lvh.me:3002",
      "localhost:3000",
      "127.0.0.1",
      "uprise-admin-prog-network.vercel.app", // preview deploy
      "",
    ]) {
      expect(isCustomParentHost(host), host).toBe(false);
    }
  });

  /**
   * Regression, and the reason `PLATFORM_OWNED_DOMAINS` exists. Every host here made the
   * old "not in roots ⇒ custom" gate return true. All are reachable in production, and on
   * such a page the api-client derived a sibling origin that no CORS entry and no cookie
   * domain matched — so the request was rejected where it previously worked.
   */
  it("is false for the live shapes that defeated the old gate", () => {
    for (const host of [
      // 1. trailing-dot FQDN — `https://api.uprise.org.au./api/v1/health` answers 200
      "admin.uprise.org.au.",
      "auth.uprise.org.au.",
      "api.uprise.org.au.",
      "www.uprise.org.au.",
      "admin.dev.uprise.org.au.",
      "ADMIN.UPRISE.ORG.AU.",
      "admin.uprise.org.au.:443",
      // 2. upriselabs.org — organisation-marketing is deployed there and transpiles api-client
      "www.upriselabs.org",
      "admin.upriselabs.org",
      // 3. deeper subdomains of a domain we own
      "admin.staging.uprise.org.au",
      "auth.foo.bar.uprise.org.au",
      // 4. `www` on the platform root (reserved label, so it takes the app-host branch)
      "www.uprise.org.au",
    ]) {
      expect(isCustomParentHost(host), host).toBe(false);
    }
  });

  it("is true only for an app host on a non-platform parent", () => {
    expect(isCustomParentHost("admin.commonthreads.org.au")).toBe(true);
    expect(isCustomParentHost("api.commonthreads.org.au")).toBe(true);
    expect(isCustomParentHost("field.acme.com.au")).toBe(true);
    // …and still true with the trailing dot, which must normalise rather than disqualify.
    expect(isCustomParentHost("admin.commonthreads.org.au.")).toBe(true);
  });

  it("treats a caller-supplied roots list as additive, not as the whole truth", () => {
    // A caller-supplied root is honoured…
    expect(isCustomParentHost("admin.dev.uprise.org.au", ["dev.uprise.org.au"])).toBe(false);
    // …but narrowing `roots` must NOT reclassify a domain we own as a tenant's. This
    // previously returned true: the dev API, handed a prod host, would have gone looking for
    // a TenantDomain row called `uprise.org.au`.
    expect(isCustomParentHost("admin.uprise.org.au", ["dev.uprise.org.au"])).toBe(false);
    expect(isCustomParentHost("www.upriselabs.org", ["dev.uprise.org.au"])).toBe(false);
    // A genuine tenant domain is still custom under any roots list.
    expect(isCustomParentHost("admin.commonthreads.org.au", ["dev.uprise.org.au"])).toBe(true);
  });
});

describe("isPlatformOwnedDomain", () => {
  it("matches our domains and any subdomain of them", () => {
    expect(isPlatformOwnedDomain("uprise.org.au")).toBe(true);
    expect(isPlatformOwnedDomain("dev.uprise.org.au")).toBe(true);
    expect(isPlatformOwnedDomain("staging.uprise.org.au")).toBe(true);
    expect(isPlatformOwnedDomain("upriselabs.org")).toBe(true);
  });
  it("does not match a lookalike that merely ENDS with our name", () => {
    // The suffix check must be dot-anchored or `notuprise.org.au` would read as ours.
    expect(isPlatformOwnedDomain("notuprise.org.au")).toBe(false);
    expect(isPlatformOwnedDomain("evil-uprise.org.au")).toBe(false);
    expect(isPlatformOwnedDomain("upriselabs.org.evil.com")).toBe(false);
    expect(isPlatformOwnedDomain("commonthreads.org.au")).toBe(false);
    expect(isPlatformOwnedDomain("")).toBe(false);
  });
  it("does not claim lvh.me, which we do not own", () => {
    // Local dev is covered by DEFAULT_PLATFORM_ROOTS instead — see the constant's docblock.
    expect(isPlatformOwnedDomain("lvh.me")).toBe(false);
    expect(DEFAULT_PLATFORM_ROOTS).toContain("lvh.me");
  });
});

describe("cookieDomainForHost", () => {
  it("scopes to the parent for platform and white-label app hosts alike", () => {
    expect(cookieDomainForHost("admin.uprise.org.au")).toBe(".uprise.org.au");
    expect(cookieDomainForHost("auth.uprise.org.au")).toBe(".uprise.org.au");
    expect(cookieDomainForHost("common-threads.uprise.org.au")).toBe(".uprise.org.au");
    expect(cookieDomainForHost("admin.commonthreads.org.au")).toBe(".commonthreads.org.au");
    expect(cookieDomainForHost("api.commonthreads.org.au")).toBe(".commonthreads.org.au");
  });
  it("returns host-only ('') where there is no registrable parent", () => {
    // Matches what sessionCookieOptions already does with an unset SESSION_COOKIE_DOMAIN,
    // so local dev is unchanged.
    expect(cookieDomainForHost("localhost:3000")).toBe("");
    expect(cookieDomainForHost("127.0.0.1")).toBe("");
    expect(cookieDomainForHost("uprise.org.au")).toBe("");
    expect(cookieDomainForHost("")).toBe("");
  });

  /**
   * Port-blind on purpose. Ports take no part in cookie scoping, so a host-only cookie on
   * `admin.lvh.me` is NOT sent to `api.lvh.me` — scoping to the parent is the only thing that
   * makes local cross-app SSO work, and `brandCookieDomain` already relies on it. The
   * consequence is that `Secure` must be decided by the request protocol, never by "a domain
   * was set"; pinned here because gating this on `isDerivableHost` looks like a tidy-up and
   * would silently kill the brand/theme hand-off in dev.
   */
  it("still scopes to the parent on a ported dev host", () => {
    expect(cookieDomainForHost("admin.lvh.me:3002")).toBe(".lvh.me");
    expect(cookieDomainForHost("api.lvh.me:3001")).toBe(".lvh.me");
    expect(cookieDomainForHost("auth.lvh.me:3002")).toBe(".lvh.me");
  });

  it("normalises a trailing-dot host to the same domain as its dotless form", () => {
    expect(cookieDomainForHost("admin.uprise.org.au.")).toBe(".uprise.org.au");
    expect(cookieDomainForHost("admin.commonthreads.org.au.")).toBe(".commonthreads.org.au");
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

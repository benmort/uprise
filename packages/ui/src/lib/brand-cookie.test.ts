import { afterEach, describe, expect, it, vi } from "vitest";
import { BRAND_COOKIE_NAME, brandCookieDomain, readBrandCookie, writeBrandCookie } from "./brand-cookie";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("brandCookieDomain", () => {
  it("spans our subdomains by dropping the first label", () => {
    expect(brandCookieDomain("field.uprise.org.au")).toBe(".uprise.org.au");
    expect(brandCookieDomain("auth.dev.uprise.org.au")).toBe(".dev.uprise.org.au");
  });

  it("falls back to host-only for bare hosts", () => {
    expect(brandCookieDomain("localhost")).toBe("");
    expect(brandCookieDomain("127.0.0.1")).toBe("");
    expect(brandCookieDomain("uprise.au")).toBe(""); // two labels — apex, host-only
    expect(brandCookieDomain("")).toBe("");
  });
});

describe("write/read round-trip", () => {
  const BRAND = {
    slug: "common-threads",
    name: "Common Threads",
    logoUrl: "https://cdn/logo.png",
    logoBlockUrl: "https://cdn/block.png",
    css: ":root{--brand-primary: #147454;--primary: 160 70% 27%;}",
  };

  it("writes an encoded parent-domain cookie and reads it back", () => {
    let jar = "";
    vi.stubGlobal("document", {
      get cookie() {
        return jar.split("; SameSite")[0]; // reads see name=value
      },
      set cookie(v: string) {
        jar = v;
      },
    });
    vi.stubGlobal("window", {
      location: { hostname: "field.uprise.org.au", protocol: "https:" },
    });

    writeBrandCookie(BRAND);
    expect(jar).toContain(`${BRAND_COOKIE_NAME}=`);
    expect(jar).toContain("domain=.uprise.org.au");
    expect(jar).toContain("SameSite=Lax");
    expect(jar).toContain("Secure");

    expect(readBrandCookie()).toEqual(BRAND);
  });

  it("returns null for a missing or corrupt cookie", () => {
    vi.stubGlobal("document", { cookie: "" });
    expect(readBrandCookie()).toBeNull();
    vi.stubGlobal("document", { cookie: `${BRAND_COOKIE_NAME}=%7Bnot-json` });
    expect(readBrandCookie()).toBeNull();
  });
});

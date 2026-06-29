import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DomainLogger } from "./common/logging/domain-logger.service";
import { PrismaService } from "./prisma/prisma.service";
import {
  assertCookieDomainForSso,
  configureNestApp,
  normalizeOrigin,
  parseAllowedOrigins,
  sharedParentDomain,
} from "./bootstrap";

type CorsOriginHandler = (
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
) => void;

describe("bootstrap CORS configuration", () => {
  // The cookie-domain guard legitimately warns for these multi-subdomain origins
  // (no SESSION_COOKIE_DOMAIN in the mock config); keep the test output clean.
  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warnSpy.mockRestore());

  function createApp(rawOrigins: string) {
    let capturedOrigin: CorsOriginHandler | null = null;
    const config = {
      get: (_key: string, fallback?: string) =>
        _key === "CORS_ALLOWED_ORIGINS" ? rawOrigins : (fallback ?? ""),
    } as ConfigService;
    const logger = {
      error: jest.fn(),
      warn: jest.fn(),
      log: jest.fn(),
    } as unknown as DomainLogger;
    const prisma = {
      enableShutdownHooks: jest.fn().mockResolvedValue(undefined),
    } as unknown as PrismaService;

    const app = {
      get: jest.fn((token: unknown) => {
        if (token === ConfigService) return config;
        if (token === DomainLogger) return logger;
        if (token === PrismaService) return prisma;
        return undefined;
      }),
      enableCors: jest.fn((options: { origin?: CorsOriginHandler }) => {
        capturedOrigin = options.origin ?? null;
      }),
      setGlobalPrefix: jest.fn(),
      useGlobalPipes: jest.fn(),
      useGlobalFilters: jest.fn(),
      useGlobalInterceptors: jest.fn(),
    } as unknown as INestApplication;

    return { app, prisma, getOriginHandler: () => capturedOrigin };
  }

  it("normalizes origins for consistent matching", () => {
    expect(normalizeOrigin(" HTTPS://UPRISE.ORG.AU/ ")).toBe("https://uprise.org.au");
    expect(parseAllowedOrigins("https://uprise.org.au/, https://www.uprise.org.au")).toEqual(
      new Set(["https://uprise.org.au", "https://www.uprise.org.au"]),
    );
  });

  it("allows configured origin and denies non-allowlisted origin without throwing", async () => {
    const { app, prisma, getOriginHandler } = createApp(
      "https://uprise.org.au,https://www.uprise.org.au/",
    );
    await configureNestApp(app);
    expect(prisma.enableShutdownHooks).toHaveBeenCalledTimes(1);

    const originHandler = getOriginHandler();
    expect(originHandler).not.toBeNull();
    if (!originHandler) throw new Error("Missing CORS origin handler");

    const allowed = await new Promise<{ error: Error | null; allow?: boolean }>((resolve) => {
      originHandler("https://UPRISE.ORG.AU/", (error, allow) => resolve({ error, allow }));
    });
    expect(allowed.error).toBeNull();
    expect(allowed.allow).toBe(true);

    const denied = await new Promise<{ error: Error | null; allow?: boolean }>((resolve) => {
      originHandler("https://evil.example", (error, allow) => resolve({ error, allow }));
    });
    expect(denied.error).toBeNull();
    expect(denied.allow).toBe(false);

    const noOrigin = await new Promise<{ error: Error | null; allow?: boolean }>((resolve) => {
      originHandler(undefined, (error, allow) => resolve({ error, allow }));
    });
    expect(noOrigin.error).toBeNull();
    expect(noOrigin.allow).toBe(true);
  });

  it("allows all origins when allowlist is empty", async () => {
    const { app, getOriginHandler } = createApp("");
    await configureNestApp(app);
    const originHandler = getOriginHandler();
    expect(originHandler).not.toBeNull();
    if (!originHandler) throw new Error("Missing CORS origin handler");

    const result = await new Promise<{ error: Error | null; allow?: boolean }>((resolve) => {
      originHandler("https://random-origin.example", (error, allow) => resolve({ error, allow }));
    });
    expect(result.error).toBeNull();
    expect(result.allow).toBe(true);
  });
});

describe("cross-subdomain SSO cookie-domain guard", () => {
  describe("sharedParentDomain", () => {
    it("finds the shared parent across distinct subdomains", () => {
      expect(
        sharedParentDomain(["https://admin.dev.uprise.org.au", "https://api.dev.uprise.org.au"]),
      ).toBe("dev.uprise.org.au");
    });

    it("treats www vs apex as a shared parent", () => {
      expect(sharedParentDomain(["https://uprise.org.au", "https://www.uprise.org.au"])).toBe(
        "uprise.org.au",
      );
    });

    it("returns null for identical hosts differing only by port (localhost dev)", () => {
      expect(sharedParentDomain(["http://localhost:3000", "http://localhost:3002"])).toBeNull();
    });

    it("returns null for a single origin", () => {
      expect(sharedParentDomain(["https://api.dev.uprise.org.au"])).toBeNull();
    });

    it("returns null when hosts share only a single trailing label", () => {
      expect(sharedParentDomain(["https://foo.com", "https://bar.com"])).toBeNull();
    });
  });

  describe("assertCookieDomainForSso", () => {
    const ssoOrigins = new Set(["https://admin.dev.uprise.org.au", "https://api.dev.uprise.org.au"]);

    it("throws in production when SSO spans subdomains but the cookie domain is empty", () => {
      expect(() => assertCookieDomainForSso(ssoOrigins, "", true)).toThrow(/SESSION_COOKIE_DOMAIN/);
    });

    it("warns (does not throw) outside production", () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      expect(() => assertCookieDomainForSso(ssoOrigins, "", false)).not.toThrow();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(".dev.uprise.org.au"));
      warn.mockRestore();
    });

    it("is a no-op when the cookie domain is set", () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      expect(() => assertCookieDomainForSso(ssoOrigins, ".dev.uprise.org.au", true)).not.toThrow();
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it("is a no-op for single-host (localhost) setups", () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      expect(() =>
        assertCookieDomainForSso(new Set(["http://localhost:3000", "http://localhost:3002"]), "", true),
      ).not.toThrow();
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});

import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DomainLogger } from "./common/logging/domain-logger.service";
import { PrismaService } from "./prisma/prisma.service";
import { configureNestApp, normalizeOrigin, parseAllowedOrigins } from "./bootstrap";

type CorsOriginHandler = (
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
) => void;

describe("bootstrap CORS configuration", () => {
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
    expect(normalizeOrigin(" HTTPS://YARNS.ORG.AU/ ")).toBe("https://yarns.org.au");
    expect(parseAllowedOrigins("https://yarns.org.au/, https://www.yarns.org.au")).toEqual(
      new Set(["https://yarns.org.au", "https://www.yarns.org.au"]),
    );
  });

  it("allows configured origin and denies non-allowlisted origin without throwing", async () => {
    const { app, prisma, getOriginHandler } = createApp(
      "https://yarns.org.au,https://www.yarns.org.au/",
    );
    await configureNestApp(app);
    expect(prisma.enableShutdownHooks).toHaveBeenCalledTimes(1);

    const originHandler = getOriginHandler();
    expect(originHandler).not.toBeNull();
    if (!originHandler) throw new Error("Missing CORS origin handler");

    const allowed = await new Promise<{ error: Error | null; allow?: boolean }>((resolve) => {
      originHandler("https://YARNS.ORG.AU/", (error, allow) => resolve({ error, allow }));
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

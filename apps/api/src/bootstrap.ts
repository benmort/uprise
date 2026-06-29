import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ApiExceptionFilter } from "./common/http/api-exception.filter";
import { ApiResponseInterceptor } from "./common/http/api-response.interceptor";
import { RequestLoggingInterceptor } from "./common/logging/request-logging.interceptor";
import { DomainLogger } from "./common/logging/domain-logger.service";
import { PrismaService } from "./prisma/prisma.service";
import { ConfigService } from "@nestjs/config";

export function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "").toLowerCase();
}

export function parseAllowedOrigins(rawOrigins: string): Set<string> {
  return new Set(
    rawOrigins
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => normalizeOrigin(value)),
  );
}

/**
 * The longest dotted suffix of ≥2 labels shared by two or more DISTINCT, non-local
 * hostnames among the given origins (e.g. `dev.uprise.org.au` for
 * `admin.dev.uprise.org.au` + `api.dev.uprise.org.au`). Returns null when the
 * origins are a single host, all identical (e.g. `localhost` on different ports),
 * IPs, or otherwise don't share a registrable-looking parent.
 */
export function sharedParentDomain(origins: Iterable<string>): string | null {
  const hosts = [
    ...new Set(
      [...origins]
        .map((origin) => {
          try {
            return new URL(origin).hostname.toLowerCase();
          } catch {
            return "";
          }
        })
        .filter((host) => host && host !== "localhost" && !/^[0-9.]+$/.test(host)),
    ),
  ];
  if (hosts.length < 2) return null;
  let suffix = hosts[0].split(".");
  for (const labels of hosts.slice(1).map((host) => host.split("."))) {
    const common: string[] = [];
    for (let i = suffix.length - 1, j = labels.length - 1; i >= 0 && j >= 0 && suffix[i] === labels[j]; i--, j--) {
      common.unshift(suffix[i]);
    }
    suffix = common;
    if (suffix.length === 0) break;
  }
  return suffix.length >= 2 ? suffix.join(".") : null;
}

/**
 * Cross-subdomain SSO (meld doc 14) needs the session cookie scoped to the shared
 * parent domain. If the configured CORS origins span multiple subdomains of a
 * common parent but SESSION_COOKIE_DOMAIN is empty, the cookie is minted host-only
 * on the API host — invisible to the other apps, whose middleware then bounces
 * forever (the SSO redirect loop this guard exists to prevent). Fail fast in
 * production; warn loudly everywhere else (so localhost/test dev still boots).
 */
export function assertCookieDomainForSso(
  configuredOrigins: Set<string>,
  sessionCookieDomain: string,
  isProduction: boolean,
): void {
  if (sessionCookieDomain.trim().length > 0) return;
  const parent = sharedParentDomain(configuredOrigins);
  if (!parent) return;
  const message =
    `SESSION_COOKIE_DOMAIN is empty but CORS_ALLOWED_ORIGINS spans multiple subdomains ` +
    `of "${parent}". The session cookie will be minted host-only and is invisible to the ` +
    `other apps — cross-subdomain SSO will redirect-loop. Set SESSION_COOKIE_DOMAIN=.${parent}`;
  if (isProduction) throw new Error(message);
  // eslint-disable-next-line no-console
  console.warn(`[bootstrap] ${message}`);
}

export async function configureNestApp(app: INestApplication): Promise<void> {
  const config = app.get(ConfigService);
  const configuredOrigins = parseAllowedOrigins(config.get<string>("CORS_ALLOWED_ORIGINS", ""));
  assertCookieDomainForSso(
    configuredOrigins,
    config.get<string>("SESSION_COOKIE_DOMAIN", ""),
    config.get<string>("NODE_ENV") === "production",
  );
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (configuredOrigins.size === 0) {
        callback(null, true);
        return;
      }
      callback(null, configuredOrigins.has(normalizeOrigin(origin)));
    },
    // credentialed so the standalone auth app + web app send the parent-domain
    // session cookie cross-subdomain (meld doc 14). The dynamic origin callback
    // echoes the request origin (never "*"), which is valid with credentials.
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    // cf-turnstile-response carries the Cloudflare Turnstile token on captcha-guarded
    // routes (@RequireCaptcha) — the api-client sends it as a custom header, so it must
    // be allowlisted or the preflight fails and the browser blocks the request.
    allowedHeaders: ["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With", "cf-turnstile-response"],
    optionsSuccessStatus: 204,
    maxAge: 600,
  });
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter(app.get(DomainLogger)));
  app.useGlobalInterceptors(
    new ApiResponseInterceptor(),
    new RequestLoggingInterceptor(app.get(DomainLogger)),
  );

  const prisma = app.get(PrismaService);
  await prisma.enableShutdownHooks(app);
}

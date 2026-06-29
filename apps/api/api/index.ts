import "reflect-metadata";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import express from "express";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { configureNestApp, normalizeOrigin, parseAllowedOrigins } from "../src/bootstrap";

const expressServer = express();

// CORS at the function entry. Nest's app.enableCors() (configureNestApp) does not
// take effect through this Vercel serverless express entry — preflights fall through
// to a 404 and responses carry no Access-Control headers. We apply the same allowlist
// here so the browser-facing apps (auth/admin/marketing/field) can call the API
// cross-origin. Mirrors the allowlist + headers in apps/api/src/bootstrap.ts.
const allowedOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS ?? "");
const CORS_METHODS = "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS";
const CORS_HEADERS = "Authorization,Content-Type,Accept,Origin,X-Requested-With,cf-turnstile-response";
// First-party apps all live on uprise.org.au subdomains (auth/admin/marketing/field/action).
// Allow them without needing every subdomain enumerated in CORS_ALLOWED_ORIGINS.
const FIRST_PARTY_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*uprise\.org\.au$/;

/** True if the origin is in the configured allowlist, a first-party uprise.org.au host,
 * or any origin when no allowlist is configured. */
function isOriginAllowed(origin: string): boolean {
  const normalised = normalizeOrigin(origin);
  if (allowedOrigins.size === 0) return true;
  if (allowedOrigins.has(normalised)) return true;
  return FIRST_PARTY_ORIGIN.test(normalised);
}

/** Set CORS response headers when the request origin is allowed. */
function applyCors(req: VercelRequest, res: VercelResponse): void {
  const origin = req.headers.origin;
  if (typeof origin !== "string") return;
  if (!isOriginAllowed(origin)) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", CORS_METHODS);
    res.setHeader("Access-Control-Allow-Headers", CORS_HEADERS);
    res.setHeader("Access-Control-Max-Age", "600");
  }
}
let app: INestApplication | null = null;
let appInitPromise: Promise<INestApplication> | null = null;

async function getApp(): Promise<INestApplication> {
  if (app) return app;
  if (!appInitPromise) {
    appInitPromise = (async () => {
      const nestApp = await NestFactory.create(
        AppModule,
        new ExpressAdapter(expressServer),
        // rawBody enables Stripe webhook signature verification on Vercel (meld doc 08).
        { rawBody: true },
      );
      await configureNestApp(nestApp);
      await nestApp.init();
      app = nestApp;
      return nestApp;
    })();
  }
  return appInitPromise;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  applyCors(req, res);
  // Answer the CORS preflight here — it needs no app logic, and short-circuiting
  // avoids a cold-start init on every OPTIONS.
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  await getApp();
  expressServer(req, res);
}

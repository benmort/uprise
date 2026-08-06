import {
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  RawBodyRequest,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { RequirePermission } from "../auth/require-permission.decorator";
import { ObservabilityService, type LogSource } from "./observability.service";
import { INSPECTABLE_STATES, type InspectableState } from "./queue-inspector.service";
import { verifyDrainSignature } from "./vercel-drain";
import type { LogLevel } from "./log-line.parser";

/**
 * Reuses `system.queue-stats`, which is granted to no tenant role, so only super-admin
 * (`manage all`) satisfies it. Logs are cross-tenant by nature — a worker error mentions whichever
 * tenant's job failed — so there is no tenant-scoped version of this surface to offer.
 */
const SUPER_ADMIN = { action: "read", resource: "system.queue-stats" } as const;

const LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];
const SOURCES: readonly LogSource[] = ["stored", "railway", "vercel"];

/** `90s` / `30m` / `2h` / `3d` → ms. Shared vocabulary with the ops:logs CLI. */
export function parseSinceParam(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const match = /^(\d+)\s*([smhd])$/i.exec(raw.trim());
  if (!match) return undefined;
  const per: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Number(match[1]) * (per[match[2].toLowerCase()] ?? 0);
}

function csv<T extends string>(raw: string | undefined, allowed: readonly T[]): T[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is T => (allowed as readonly string[]).includes(s));
}

@Controller("observability")
export class ObservabilityController {
  constructor(
    private readonly observability: ObservabilityService,
    private readonly config: ConfigService,
  ) {}

  /**
   * One query across stored errors, the Railway worker stream and Vercel build logs.
   *
   * Defaults to `stored`, which is the only source that outlives provider retention and the only
   * one that covers Vercel runtime errors at all.
   */
  @Get("logs")
  @RequirePermission(SUPER_ADMIN)
  async logs(
    @Query("source") source?: string,
    @Query("level") level?: string,
    @Query("domain") domain?: string,
    @Query("q") q?: string,
    @Query("since") since?: string,
    @Query("project") project?: string,
    @Query("limit") limit?: string,
  ) {
    const sinceMs = parseSinceParam(since);
    const levelValue = LEVELS.includes(level as LogLevel) ? (level as LogLevel) : undefined;
    return this.observability.queryLogs({
      sources: csv(source, SOURCES),
      level: levelValue,
      domain: domain?.trim() || undefined,
      q: q?.trim() || undefined,
      sinceMs: sinceMs ? Date.now() - sinceMs : undefined,
      project: project?.trim() || undefined,
      limit: Number(limit) || undefined,
    });
  }

  /**
   * Jobs by queue and state — including `delayed`, which is where a job that fails on every
   * attempt actually waits. Counts alone hid a real incident for months.
   */
  @Get("queue/jobs")
  @RequirePermission(SUPER_ADMIN)
  async queueJobs(
    @Query("queue") queue?: string,
    @Query("state") state?: string,
    @Query("limit") limit?: string,
  ) {
    return this.observability.queueJobs({
      queues: (queue ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      states: csv<InspectableState>(state, INSPECTABLE_STATES),
      limit: Number(limit) || undefined,
    });
  }

  /**
   * Retention sweep. Platform cron (Bearer CRON_SECRET, no session — allowlisted in
   * BasicAuthGuard's cron paths), so no @RequirePermission: AbilityGuard would deny a
   * session-less request outright.
   */
  @Get("logs/sweep")
  @Post("logs/sweep")
  async sweep() {
    return this.observability.sweepRetention();
  }

  /**
   * Ownership handshake for creating the drain.
   *
   * Vercel will not accept a drain endpoint until the URL answers with an `x-vercel-verify`
   * header carrying the token it issues. Public by necessity — it runs before any drain (and so
   * any secret) exists — but it only ever echoes a value the operator configured, reads nothing
   * and writes nothing.
   */
  @Get("vercel-drain")
  verify(@Res() res: Response): void {
    const token = this.config.get<string>("VERCEL_LOG_DRAIN_VERIFY", "").trim();
    if (token) res.setHeader("x-vercel-verify", token);
    res.status(200).send("ok");
  }

  /**
   * Vercel log-drain intake — the six Next apps' server-side runtime output, which has no other
   * durable home (they are not Nest, so no DomainLogger, and Vercel exposes no API to read runtime
   * logs back).
   *
   * Public-allowlisted, so the HMAC over the RAW body is the only thing protecting it: an
   * unconfigured secret refuses rather than passes. Always answers 200 on a verified request —
   * Vercel retries a non-2xx delivery in full, so reporting a partial batch as failure is how a
   * drain wedges into a retry loop.
   */
  @Post("vercel-drain")
  @HttpCode(200)
  async ingestDrain(@Req() req: RawBodyRequest<Request>) {
    const secret = this.config.get<string>("VERCEL_LOG_DRAIN_SECRET", "").trim();
    const signature = req.headers["x-vercel-signature"];
    const ok = verifyDrainSignature(
      req.rawBody,
      typeof signature === "string" ? signature : undefined,
      secret,
    );
    if (!ok) throw new UnauthorizedException("Invalid Vercel log-drain signature");
    const raw = req.rawBody ? req.rawBody.toString("utf8") : "";
    return this.observability.ingestVercelDrain(raw);
  }
}

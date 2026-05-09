import { Injectable, NestMiddleware } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NextFunction, Response } from "express";
import { DomainLogger } from "../logging/domain-logger.service";
import type { RequestWithId } from "./request-id.middleware";

type CounterBucket = {
  windowStartMs: number;
  count: number;
};

@Injectable()
export class BasicRateLimitMiddleware implements NestMiddleware {
  private readonly counters = new Map<string, CounterBucket>();

  constructor(
    private readonly config: ConfigService,
    private readonly logger: DomainLogger,
  ) {}

  private getWindowMs(): number {
    const raw = Number(this.config.get<string>("RATE_LIMIT_WINDOW_MS", "60000"));
    if (!Number.isFinite(raw)) return 60000;
    return Math.min(Math.max(1000, Math.trunc(raw)), 3600000);
  }

  private getMaxRequests(): number {
    const raw = Number(this.config.get<string>("RATE_LIMIT_MAX_REQUESTS", "300"));
    if (!Number.isFinite(raw)) return 300;
    return Math.min(Math.max(10, Math.trunc(raw)), 10000);
  }

  private isExemptPath(path: string): boolean {
    return path === "/inbound-text-message-hook" || path === "/api/v1/inbound-text-message-hook";
  }

  private getClientKey(req: RequestWithId): string {
    const forwarded = req.header("x-forwarded-for");
    if (forwarded && forwarded.trim()) {
      return forwarded.split(",")[0].trim();
    }
    return req.ip || req.socket.remoteAddress || "unknown";
  }

  private prune(nowMs: number, windowMs: number): void {
    if (this.counters.size < 10000) return;
    for (const [key, bucket] of this.counters.entries()) {
      if (nowMs - bucket.windowStartMs > windowMs * 2) {
        this.counters.delete(key);
      }
    }
  }

  use(req: RequestWithId, res: Response, next: NextFunction): void {
    const path = req.path || req.originalUrl || req.url || "";
    if (this.isExemptPath(path.split("?")[0])) {
      next();
      return;
    }

    const nowMs = Date.now();
    const windowMs = this.getWindowMs();
    const maxRequests = this.getMaxRequests();
    const key = this.getClientKey(req);
    const current = this.counters.get(key);
    if (!current || nowMs - current.windowStartMs >= windowMs) {
      this.counters.set(key, { windowStartMs: nowMs, count: 1 });
      next();
      return;
    }

    current.count += 1;
    if (current.count <= maxRequests) {
      next();
      return;
    }

    this.prune(nowMs, windowMs);
    this.logger.warn("http", "Rate limit exceeded", {
      client: key,
      path,
      count: current.count,
      requestId: req.requestId,
    });
    res.status(429).json({
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please retry shortly.",
      },
      requestId: req.requestId,
    });
  }
}

import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { REQUIRE_CAPTCHA_KEY, type CaptchaTier } from "./require-captcha.decorator";
import { TurnstileService } from "./turnstile.service";

const TOKEN_HEADER = "cf-turnstile-response";

/**
 * Cloudflare Turnstile guard (mirrors AbilityGuard's metadata-driven pattern). Runs as a
 * global guard but only acts on routes decorated with @RequireCaptcha. No-op when Turnstile
 * isn't configured. The token rides in the `cf-turnstile-response` header (no DTO changes).
 */
@Injectable()
export class TurnstileGuard implements CanActivate {
  private readonly logger = new Logger(TurnstileGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly turnstile: TurnstileService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const tier = this.reflector.getAllAndOverride<CaptchaTier>(REQUIRE_CAPTCHA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!tier) return true; // route isn't captcha-gated
    if (!this.turnstile.isConfigured()) return true; // feature inert (dev / unconfigured)

    const request = context.switchToHttp().getRequest<Request>();
    const outcome = await this.turnstile.verify(this.headerToken(request), this.clientIp(request));

    if (outcome === "pass") return true;
    if (outcome === "fail") throw new ForbiddenException("Captcha verification failed");

    // outcome === "unavailable": Cloudflare unreachable. Strict fails closed; soft fails open.
    if (tier === "soft") {
      this.logger.warn(
        `Turnstile unavailable; allowing soft-tier ${request.method} ${request.path}`,
      );
      return true;
    }
    throw new ForbiddenException("Captcha verification unavailable");
  }

  private headerToken(req: Request): string | undefined {
    const h = req.headers[TOKEN_HEADER];
    return Array.isArray(h) ? h[0] : typeof h === "string" ? h : undefined;
  }

  private clientIp(req: Request): string | undefined {
    const fwd = req.headers["x-forwarded-for"];
    if (typeof fwd === "string" && fwd.trim()) return fwd.split(",")[0].trim();
    return req.ip || req.socket?.remoteAddress || undefined;
  }
}

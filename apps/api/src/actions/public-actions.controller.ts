import { Body, Controller, Get, Header, Param, Post, Query, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { ActionsService } from "./actions.service";
import { RequireCaptcha } from "../common/captcha/require-captcha.decorator";
import { CreateCallSessionDto } from "./dto/actions.dto";
import { resolveActionsTokenSecret, verifySessionToken } from "./session-token.util";

/**
 * The PUBLIC action-page surface (no session): page payloads for apps/action,
 * the frame-policy read the action middleware builds its CSP from, the
 * call-session mint, and the per-session SSE progress stream.
 *
 * Open by design — allowlisted in BasicAuthGuard (`/actions/public/` regex) and
 * in the route-authorization guardrail. Safety is service-level, the
 * PublicInsightsController pattern: DRAFT pages 404 exactly like missing ones
 * (page-scoped preview tokens excepted), the session mint is rate-limited +
 * optionally captcha-gated BEFORE any token is minted (it spends tenant Twilio
 * money), and the SSE stream authenticates a per-session HMAC token.
 */
@Controller("actions/public")
export class PublicActionsController {
  constructor(
    private readonly actions: ActionsService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get("pages/:slug")
  getPage(@Param("slug") slug: string, @Query("previewToken") previewToken?: string) {
    return this.actions.getPublicPage(slug, previewToken);
  }

  /** Consumed only by the action app's middleware; short-cacheable by design. */
  @Get("pages/:slug/frame-policy")
  @Header("Cache-Control", "public, max-age=60")
  framePolicy(@Param("slug") slug: string) {
    return this.actions.getFramePolicy(slug);
  }

  /** Chooser search — leak-safe member identities for the widget's finder.
   *  Same bot protection as the auth flows: Turnstile (soft tier — an outage
   *  must not blank the finder) + its own per-IP rate window. */
  @Get("pages/:slug/targets")
  @RequireCaptcha("soft")
  @Header("Cache-Control", "private, max-age=30")
  searchTargets(@Param("slug") slug: string, @Query("q") q: string | undefined, @Req() req: Request) {
    return this.actions.searchPublicTargets(slug, q ?? "", this.clientIp(req));
  }

  @Post("pages/:slug/call-sessions")
  @RequireCaptcha("strict")
  createCallSession(@Param("slug") slug: string, @Body() dto: CreateCallSessionDto, @Req() req: Request) {
    return this.actions.createPublicCallSession(slug, dto, {
      clientIp: this.clientIp(req),
      captchaToken: this.captchaToken(req),
    });
  }

  /**
   * Call-progress SSE. Minimal Phase-5 stream: verify the session token, replay
   * rows after `Last-Event-ID`/`?after`, then poll the ledger every 1.5 s for up
   * to 25 s (the serverless-safe analytics pattern) and end — the widget's
   * EventSource reconnects with the last seen id.
   */
  // Phase 4b hardening: richer stream (heartbeat cadence, session-terminal close).
  @Get("call-sessions/:id/events")
  async events(
    @Param("id") sessionId: string,
    @Query("token") token: string,
    @Query("after") after: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const secret = resolveActionsTokenSecret(this.config);
    const v = verifySessionToken(token ?? "", secret, "progress");
    if (!v.ok || v.subjectId !== sessionId) {
      res.status(401).json({ ok: false, error: { code: "INVALID_SESSION_TOKEN", message: "Invalid stream token" } });
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // Compressing an event stream buffers it — a gzip edge (ngrok, some CDNs)
    // would hold every event until the stream closes and the widget would sit
    // on "Connecting" through a whole live call (found by the live smoke).
    // An explicit identity encoding stops edges re-compressing; the nginx-ism
    // is belt-and-braces for proxies that buffer for other reasons.
    res.setHeader("Content-Encoding", "identity");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const lastEventHeader = req.headers["last-event-id"];
    let cursor = BigInt(0);
    const fromHeader = Array.isArray(lastEventHeader) ? lastEventHeader[0] : lastEventHeader;
    const fromQuery = after;
    for (const raw of [fromHeader, fromQuery]) {
      if (raw && /^\d+$/.test(raw)) {
        const n = BigInt(raw);
        if (n > cursor) cursor = n;
      }
    }

    let open = true;
    req.on("close", () => {
      open = false;
    });

    const startedAt = Date.now();
    const MAX_MS = 25_000;
    const POLL_MS = this.config.get<number>("ACTIONS_SSE_POLL_MS", 400);
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    res.write(`: connected\n\n`);
    while (open && Date.now() - startedAt < MAX_MS) {
      const rows = await this.prisma.dialerSessionEvent.findMany({
        where: { sessionId, tenantId: v.tenantId, seq: { gt: cursor } },
        orderBy: { seq: "asc" },
        take: 100,
      });
      for (const row of rows) {
        cursor = row.seq > cursor ? row.seq : cursor;
        res.write(`id: ${row.seq}\nevent: ${row.name}\ndata: ${JSON.stringify(row.payload ?? {})}\n\n`);
      }
      if (!rows.length) res.write(`: heartbeat\n\n`);
      await sleep(POLL_MS);
    }
    res.end();
  }

  private clientIp(req: Request): string | null {
    const fwd = req.headers["x-forwarded-for"];
    const first = Array.isArray(fwd) ? fwd[0] : fwd;
    if (first) return first.split(",")[0]?.trim() || null;
    return req.socket?.remoteAddress ?? null;
  }

  private captchaToken(req: Request): string | undefined {
    const h = req.headers["cf-turnstile-response"];
    const raw = Array.isArray(h) ? h[0] : h;
    return raw?.trim() || undefined;
  }
}

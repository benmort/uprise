import { Body, Controller, Get, Param, Post, Query, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import { CallsService } from "./calls.service";
import { InitiateCallDto, ListCallsDto } from "./dto/call.dto";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantId } from "../auth/tenant-id.decorator";
import type { AuthUser } from "../auth/auth-user";

// Voice calling is an organiser/owner domain (meld doc 09). Gated on telephony.call;
// `manage telephony.all` (organiser/owner) and `read telephony.all` (member) cover it.
// This is the TRANSACTIONAL calls domain (one-to-one, event-driven); bulk/predictive
// dialling is a separate future domain (the deferred voice-dispatch worker).
const READ = { action: "read", resource: "telephony.call" } as const;
const OPERATE = { action: "operate", resource: "telephony.call" } as const;

@Controller("calls")
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Post()
  @RequirePermission(OPERATE)
  initiate(@TenantId() tenantId: string, @Body() dto: InitiateCallDto) {
    return this.calls.initiate(tenantId, dto);
  }

  @Get()
  @RequirePermission(READ)
  list(@TenantId() tenantId: string, @Query() dto: ListCallsDto) {
    return this.calls.listCalls(tenantId, dto);
  }

  /** KPI aggregates over the same filter as the list (declared before `:id`). */
  @Get("stats")
  @RequirePermission(READ)
  stats(@TenantId() tenantId: string, @Query() dto: ListCallsDto) {
    return this.calls.stats(tenantId, dto);
  }

  /** Mint a browser (WebRTC) voice access token for the softphone (before `:id`). */
  @Get("voice-token")
  @RequirePermission(OPERATE)
  voiceToken(@TenantId() tenantId: string, @Req() req: Request & { user: AuthUser }) {
    return this.calls.voiceToken(req.user.id, tenantId);
  }

  /**
   * Stream a call's recording for in-app playback. Proxies the Twilio media
   * (which needs account Basic-auth) behind the session guard so an `<audio>`
   * element can load it with the SSO cookie. `@Res()` for a binary body.
   */
  @Get(":id/recording")
  @RequirePermission(READ)
  async recording(@TenantId() tenantId: string, @Param("id") id: string, @Res() res: Response) {
    const { contentType, body } = await this.calls.streamRecording(tenantId, id);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(body);
  }

  @Get(":id")
  @RequirePermission(READ)
  get(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.calls.getCall(tenantId, id);
  }
}

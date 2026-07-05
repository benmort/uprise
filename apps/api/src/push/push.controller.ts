import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ConfigService } from "@nestjs/config";
import { AppUserRole } from "@uprise/db";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantId } from "../auth/tenant-id.decorator";
import type { AuthUser } from "../auth/auth-user";
import { PushService, type PushSubscriptionInput } from "./push.service";

// Any canvasser can register their own device for push; broadcast is organiser-only.
const CANVASSER = { action: "read", resource: "canvass.campaign" } as const;

@Controller("push")
export class PushController {
  constructor(
    private readonly config: ConfigService,
    private readonly push: PushService,
  ) {}

  /** Public key + enabled flag so the client can decide whether to offer push. */
  @Get("config")
  config2() {
    return {
      enabled: this.push.isEnabled(),
      publicKey: this.config.get<string>("VAPID_PUBLIC_KEY", "") || null,
    };
  }

  @Post("subscribe")
  @RequirePermission(CANVASSER)
  async subscribe(
    @TenantId() tenantId: string,
    @Body() sub: PushSubscriptionInput,
    @Req() req: Request & { user?: AuthUser },
  ) {
    await this.push.subscribe(tenantId, req.user?.id ?? null, sub);
    return { ok: true };
  }

  @Post("broadcast")
  @UseGuards(RolesGuard)
  @Roles(AppUserRole.ORGANISER)
  async broadcast(
    @TenantId() tenantId: string,
    @Body() body: { title: string; body: string; url?: string },
  ) {
    return this.push.broadcast(tenantId, {
      title: body.title || "Uprise",
      body: body.body || "",
      url: body.url,
    });
  }
}

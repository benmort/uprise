import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ConfigService } from "@nestjs/config";
import { AppUserRole } from "../../src/generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { AuthUser } from "../auth/auth-user";
import { PushService, type PushSubscriptionInput } from "./push.service";

@Controller("push")
export class PushController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  private async ensureOrganization() {
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    return this.prisma.organization.upsert({
      where: { slug },
      create: { slug, name: "Default Organization" },
      update: {},
    });
  }

  /** Public key + enabled flag so the client can decide whether to offer push. */
  @Get("config")
  config2() {
    return {
      enabled: this.push.isEnabled(),
      publicKey: this.config.get<string>("VAPID_PUBLIC_KEY", "") || null,
    };
  }

  @Post("subscribe")
  async subscribe(@Body() sub: PushSubscriptionInput, @Req() req: Request & { user?: AuthUser }) {
    const org = await this.ensureOrganization();
    await this.push.subscribe(org.id, req.user?.id ?? null, sub);
    return { ok: true };
  }

  @Post("broadcast")
  @UseGuards(RolesGuard)
  @Roles(AppUserRole.ORGANISER)
  async broadcast(@Body() body: { title: string; body: string; url?: string }) {
    const org = await this.ensureOrganization();
    return this.push.broadcast(org.id, {
      title: body.title || "Yarns",
      body: body.body || "",
      url: body.url,
    });
  }
}

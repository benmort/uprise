import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "../../src/generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { TwilioService } from "../twilio/twilio.service";

@Injectable()
export class WhatsappService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly twilio: TwilioService,
  ) {}

  private async ensureOrganization() {
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    return this.prisma.organization.upsert({
      where: { slug },
      create: { slug, name: "Default Organization" },
      update: {},
    });
  }

  /** Approved (and optionally all) WhatsApp templates for the composer. */
  async listTemplates(opts?: { status?: string }) {
    const org = await this.ensureOrganization();
    return this.prisma.whatsappTemplate.findMany({
      where: {
        organizationId: org.id,
        ...(opts?.status ? { status: opts.status.toLowerCase() } : {}),
      },
      orderBy: [{ status: "asc" }, { friendlyName: "asc" }],
    });
  }

  /** Pull templates from Twilio's Content API and upsert them locally. */
  async syncTemplates() {
    if (!this.config.get<boolean>("TWILIO_CONTENT_API_ENABLED", false)) {
      return { synced: 0, skipped: "TWILIO_CONTENT_API_ENABLED is off", templates: await this.listTemplates() };
    }
    const org = await this.ensureOrganization();
    const remote = await this.twilio.listWhatsappContentTemplates();
    let upserted = 0;
    for (const tpl of remote) {
      if (!tpl.contentSid) continue;
      await this.prisma.whatsappTemplate.upsert({
        where: { contentSid: tpl.contentSid },
        update: {
          organizationId: org.id,
          friendlyName: tpl.friendlyName,
          category: tpl.category,
          language: tpl.language,
          status: tpl.status,
          variables: (tpl.variables ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          bodyPreview: tpl.bodyPreview,
        },
        create: {
          organizationId: org.id,
          contentSid: tpl.contentSid,
          friendlyName: tpl.friendlyName,
          category: tpl.category,
          language: tpl.language,
          status: tpl.status,
          variables: (tpl.variables ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          bodyPreview: tpl.bodyPreview,
        },
      });
      upserted += 1;
    }
    return { synced: upserted, templates: await this.listTemplates() };
  }
}

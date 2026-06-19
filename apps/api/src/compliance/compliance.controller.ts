import { Controller, Get, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppUserRole } from "../../src/generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ComplianceService } from "./compliance.service";

@Controller("compliance")
@UseGuards(RolesGuard)
@Roles(AppUserRole.ORGANISER)
export class ComplianceController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
  ) {}

  private async ensureOrganization() {
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    return this.prisma.organization.upsert({
      where: { slug },
      create: { slug, name: "Default Organization" },
      update: {},
    });
  }

  @Get("opt-outs")
  async optOuts() {
    const org = await this.ensureOrganization();
    return this.compliance.optOutLedger(org.id);
  }
}

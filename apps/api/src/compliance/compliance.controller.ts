import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Type } from "class-transformer";
import { IsInt, IsOptional } from "class-validator";
import { AppUserRole } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ComplianceService } from "./compliance.service";

class OptOutsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() take?: number;
  @IsOptional() @Type(() => Number) @IsInt() skip?: number;
}

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
    return this.prisma.tenant.upsert({
      where: { slug },
      create: { slug, name: "Default Organization" },
      update: {},
    });
  }

  @Get("opt-outs")
  async optOuts(@Query() query: OptOutsQueryDto) {
    const org = await this.ensureOrganization();
    return this.compliance.optOutLedger(org.id, query);
  }
}

import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsInt, IsOptional } from "class-validator";
import { AppUserRole } from "@uprise/db";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { TenantId } from "../auth/tenant-id.decorator";
import { ComplianceService } from "./compliance.service";

class OptOutsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() take?: number;
  @IsOptional() @Type(() => Number) @IsInt() skip?: number;
}

@Controller("compliance")
@UseGuards(RolesGuard)
@Roles(AppUserRole.ORGANISER)
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Get("opt-outs")
  async optOuts(@TenantId() tenantId: string, @Query() query: OptOutsQueryDto) {
    return this.compliance.optOutLedger(tenantId, query);
  }
}

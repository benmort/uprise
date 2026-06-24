import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import { PlansService } from "./plans.service";
import { RequirePermission } from "../../auth/require-permission.decorator";

// Reading plans is open to flag-readers (organiser+); editing entitlements is a
// platform concern (super-admin), gated on the -global resource.
const READ = { action: "read", resource: "system.feature-flags" } as const;
const MANAGE_GLOBAL = { action: "manage", resource: "system.feature-flags-global" } as const;

class UpsertPlanDto {
  @IsString() @MaxLength(120) key!: string;
  @IsString() @MaxLength(120) displayName!: string;
  @IsObject() featureFlags!: Record<string, unknown>;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

class UpdatePlanDto {
  @IsOptional() @IsString() @MaxLength(120) displayName?: string;
  @IsOptional() @IsObject() featureFlags?: Record<string, unknown>;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() archived?: boolean;
}

@Controller("plans")
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  @RequirePermission(READ)
  list() {
    return this.plans.list();
  }

  @Post()
  @RequirePermission(MANAGE_GLOBAL)
  upsert(@Body() dto: UpsertPlanDto) {
    return this.plans.upsert(dto);
  }

  @Patch(":id")
  @RequirePermission(MANAGE_GLOBAL)
  update(@Param("id") id: string, @Body() dto: UpdatePlanDto) {
    return this.plans.update(id, dto);
  }
}

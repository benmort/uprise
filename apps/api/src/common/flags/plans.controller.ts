import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { IsArray, IsBoolean, IsInt, IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import { PlansService } from "./plans.service";
import { RequirePermission } from "../../auth/require-permission.decorator";

// Reading plans is open to flag-readers (organiser+); editing entitlements is a
// platform concern (super-admin), gated on the -global resource. The /public list
// is unauthenticated (allowlisted in BasicAuthGuard) for the marketing pricing page.
const READ = { action: "read", resource: "system.feature-flags" } as const;
const MANAGE_GLOBAL = { action: "manage", resource: "system.feature-flags-global" } as const;

class UpsertPlanDto {
  @IsString() @MaxLength(120) key!: string;
  @IsString() @MaxLength(120) displayName!: string;
  @IsObject() featureFlags!: Record<string, unknown>;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() publiclyVisible?: boolean;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsBoolean() popular?: boolean;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsInt() priceMonthly?: number;
  @IsOptional() @IsInt() priceMonthlyOriginal?: number;
  @IsOptional() @IsInt() priceAnnually?: number;
  @IsOptional() @IsInt() priceAnnuallyOriginal?: number;
  @IsOptional() @IsObject() limits?: Record<string, unknown>;
  @IsOptional() @IsArray() features?: unknown[];
}

class UpdatePlanDto {
  @IsOptional() @IsString() @MaxLength(120) displayName?: string;
  @IsOptional() @IsObject() featureFlags?: Record<string, unknown>;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() archived?: boolean;
  @IsOptional() @IsBoolean() publiclyVisible?: boolean;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsBoolean() popular?: boolean;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsInt() priceMonthly?: number;
  @IsOptional() @IsInt() priceMonthlyOriginal?: number;
  @IsOptional() @IsInt() priceAnnually?: number;
  @IsOptional() @IsInt() priceAnnuallyOriginal?: number;
  @IsOptional() @IsObject() limits?: Record<string, unknown>;
  @IsOptional() @IsArray() features?: unknown[];
}

@Controller("plans")
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  /** Public pricing page — visible plans only, no auth (allowlisted in BasicAuthGuard). */
  @Get("public")
  listPublic() {
    return this.plans.listPublic();
  }

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

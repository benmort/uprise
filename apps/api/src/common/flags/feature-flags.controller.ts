import { Body, Controller, Get, Patch, Query, Req } from "@nestjs/common";
import { IsBoolean, IsOptional, IsString } from "class-validator";
import type { Request } from "express";
import { FeatureFlagsService } from "./feature-flags.service";
import { RequirePermission } from "../../auth/require-permission.decorator";
import type { AuthUser } from "../../auth/auth-user";

const READ = { action: "read", resource: "system.feature-flags" } as const;
const MANAGE = { action: "manage", resource: "system.feature-flags" } as const;
const MANAGE_GLOBAL = { action: "manage", resource: "system.feature-flags-global" } as const;

class SetFlagDto {
  @IsString()
  flag!: string;

  // Omit (or send null) to clear the override and fall back to the next layer.
  @IsOptional()
  @IsBoolean()
  enabled?: boolean | null;
}

// Super-admin override editor: target an arbitrary tenant OR network (not both).
class SetTargetFlagDto {
  @IsString()
  flag!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean | null;

  @IsOptional()
  @IsString()
  tenantId?: string | null;

  @IsOptional()
  @IsString()
  networkId?: string | null;
}

@Controller("system")
export class FeatureFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  private ctx(req: Request & { user?: AuthUser }) {
    return { tenantId: req.user?.tenantId ?? null };
  }

  /** Effective flag map for the caller's tenant (backwards-compatible shape). */
  @Get("feature-flags")
  @RequirePermission(READ)
  list(@Req() req: Request & { user?: AuthUser }) {
    return this.flags.resolveAll(this.ctx(req));
  }

  /** Per-flag breakdown (default/env/tenant/global/effective + source) for the admin UI. */
  @Get("feature-flags/admin")
  @RequirePermission(READ)
  admin(@Req() req: Request & { user?: AuthUser }) {
    return this.flags.getAdminView(this.ctx(req));
  }

  /** Set or clear a per-tenant override for the caller's workspace (owner). */
  @Patch("feature-flags")
  @RequirePermission(MANAGE)
  async setTenant(@Req() req: Request & { user?: AuthUser }, @Body() dto: SetFlagDto) {
    await this.flags.setOverride({
      tenantId: req.user?.tenantId ?? null,
      flagKey: dto.flag,
      enabled: dto.enabled ?? null,
      updatedBy: req.user?.id ?? null,
    });
    return this.flags.getAdminView(this.ctx(req));
  }

  /** Set or clear a platform-wide global override (super-admin). */
  @Patch("feature-flags/global")
  @RequirePermission(MANAGE_GLOBAL)
  async setGlobal(@Req() req: Request & { user?: AuthUser }, @Body() dto: SetFlagDto) {
    await this.flags.setOverride({
      tenantId: null,
      flagKey: dto.flag,
      enabled: dto.enabled ?? null,
      updatedBy: req.user?.id ?? null,
    });
    return this.flags.getAdminView(this.ctx(req));
  }

  /** Admin breakdown for an arbitrary tenant or network (super-admin override editor). */
  @Get("feature-flags/admin/target")
  @RequirePermission(MANAGE_GLOBAL)
  adminTarget(@Query("tenantId") tenantId?: string, @Query("networkId") networkId?: string) {
    return this.flags.getAdminView({ tenantId: tenantId || null, networkId: networkId || null });
  }

  /** Set or clear an override for an arbitrary tenant or network (super-admin). */
  @Patch("feature-flags/target")
  @RequirePermission(MANAGE_GLOBAL)
  async setTarget(@Req() req: Request & { user?: AuthUser }, @Body() dto: SetTargetFlagDto) {
    const target = { tenantId: dto.tenantId ?? null, networkId: dto.networkId ?? null };
    await this.flags.setOverride({
      ...target,
      flagKey: dto.flag,
      enabled: dto.enabled ?? null,
      updatedBy: req.user?.id ?? null,
    });
    return this.flags.getAdminView(target);
  }
}

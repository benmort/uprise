import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { IsOptional, IsString, MaxLength } from "class-validator";
import type { Request } from "express";
import { TenantsService } from "./tenants.service";
import type { AuthUser } from "../auth/auth-user";
import { RequirePermission } from "../auth/require-permission.decorator";
import { SuperAdmin } from "../auth/super-admin.decorator";
import { CreateNetworkDto } from "./dto/tenants.dto";

class UpdateNetworkBillingDto {
  @IsOptional() @IsString() @MaxLength(120) planName?: string;
  @IsOptional() @IsString() @MaxLength(60) subscriptionStatus?: string;
}

// Network = the billing boundary above tenant (meld doc 03). owner/super-admin
// (manage tenant.network); reads use read tenant.network.
const NETWORK_MANAGE = { action: "manage", resource: "tenant.network" } as const;
const NETWORK_READ = { action: "read", resource: "tenant.network" } as const;

@Controller("networks")
export class NetworksController {
  constructor(private readonly tenants: TenantsService) {}

  @Post()
  @RequirePermission(NETWORK_MANAGE)
  create(@Body() dto: CreateNetworkDto, @Req() req: Request & { user?: AuthUser }) {
    return this.tenants.createNetwork({ name: dto.name, ownerId: req.user?.id });
  }

  // Super-admin search across ALL networks (powers the feature-flag override editor).
  // Declared before :id; @SuperAdmin is the gate.
  @Get("search")
  @SuperAdmin()
  search(@Query("q") q: string | undefined) {
    return this.tenants.searchNetworks(q);
  }

  @Get(":id")
  @RequirePermission(NETWORK_READ)
  async get(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    await this.assertNetworkAccess(req, id);
    return this.tenants.getNetwork(id);
  }

  @Get(":id/tenants")
  @RequirePermission(NETWORK_READ)
  async tenantsIn(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    await this.assertNetworkAccess(req, id);
    return this.tenants.listTenantsByNetwork(id);
  }

  // Billing writes change plan entitlements for every tenant in the network — a
  // platform action (nothing else writes Network.planName today). CASL checks the
  // ACTION only, never the instance, so without @SuperAdmin any owner could repoint
  // any network's plan by id (the ced3164 bug class).
  @Patch(":id/billing")
  @SuperAdmin()
  @RequirePermission(NETWORK_MANAGE)
  updateBilling(@Param("id") id: string, @Body() dto: UpdateNetworkBillingDto) {
    return this.tenants.updateNetworkBilling(id, dto);
  }

  /** Instance guard: super-admin, or the caller's active tenant belongs to the network. */
  private async assertNetworkAccess(req: Request & { user?: AuthUser }, networkId: string): Promise<void> {
    if (req.user?.isSuperAdmin) return;
    const tenantId = req.user?.tenantId;
    const inNetwork = tenantId ? await this.tenants.tenantBelongsToNetwork(tenantId, networkId) : false;
    if (!inNetwork) throw new ForbiddenException("This network is not available to your organisation");
  }
}

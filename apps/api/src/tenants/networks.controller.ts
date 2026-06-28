import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { IsOptional, IsString, MaxLength } from "class-validator";
import type { Request } from "express";
import { TenantsService } from "./tenants.service";
import type { AuthUser } from "../auth/auth-user";
import { RequirePermission } from "../auth/require-permission.decorator";
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
  // Declared before :id; the explicit isSuperAdmin check is the real gate.
  @Get("search")
  @RequirePermission(NETWORK_READ)
  search(@Query("q") q: string | undefined, @Req() req: Request & { user?: AuthUser }) {
    if (!req.user?.isSuperAdmin) throw new ForbiddenException("Super-admin only");
    return this.tenants.searchNetworks(q);
  }

  @Get(":id")
  @RequirePermission(NETWORK_READ)
  get(@Param("id") id: string) {
    return this.tenants.getNetwork(id);
  }

  @Get(":id/tenants")
  @RequirePermission(NETWORK_READ)
  tenantsIn(@Param("id") id: string) {
    return this.tenants.listTenantsByNetwork(id);
  }

  @Patch(":id/billing")
  @RequirePermission(NETWORK_MANAGE)
  updateBilling(@Param("id") id: string, @Body() dto: UpdateNetworkBillingDto) {
    return this.tenants.updateNetworkBilling(id, dto);
  }
}

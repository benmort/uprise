import { Body, Controller, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantsService } from "./tenants.service";
import type { AuthUser } from "../auth/auth-user";
import { RequirePermission } from "../auth/require-permission.decorator";
import { CreateNetworkDto } from "./dto/tenants.dto";

// Network = the billing boundary above tenant (meld doc 03). Creating one is an
// owner/super-admin op (manage tenant.network); it emits tenant.network.created, which
// the Stripe-customer reaction (WS2) fires off.
const NETWORK_MANAGE = { action: "manage", resource: "tenant.network" } as const;

@Controller("networks")
export class NetworksController {
  constructor(private readonly tenants: TenantsService) {}

  @Post()
  @RequirePermission(NETWORK_MANAGE)
  create(@Body() dto: CreateNetworkDto, @Req() req: Request & { user?: AuthUser }) {
    return this.tenants.createNetwork({ name: dto.name, ownerId: req.user?.id });
  }
}

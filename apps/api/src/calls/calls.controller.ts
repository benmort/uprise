import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CallsService } from "./calls.service";
import { InitiateCallDto } from "./dto/call.dto";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantId } from "../auth/tenant-id.decorator";

// Voice calling is an organiser/owner domain (meld doc 09). Gated on telephony.call;
// `manage telephony.all` (organiser/owner) and `read telephony.all` (member) cover it.
const READ = { action: "read", resource: "telephony.call" } as const;
const OPERATE = { action: "operate", resource: "telephony.call" } as const;

@Controller("calls")
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Post()
  @RequirePermission(OPERATE)
  initiate(@TenantId() tenantId: string, @Body() dto: InitiateCallDto) {
    return this.calls.initiate(tenantId, dto);
  }

  @Get()
  @RequirePermission(READ)
  list(@TenantId() tenantId: string, @Query("limit") limit?: string) {
    return this.calls.listCalls(tenantId, limit ? Number(limit) : undefined);
  }

  @Get(":id")
  @RequirePermission(READ)
  get(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.calls.getCall(tenantId, id);
  }
}

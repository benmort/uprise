import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { BlastsService } from "./blasts.service";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantId } from "../auth/tenant-id.decorator";
import {
  CreateBlastDto,
  ListBlastsDto,
  ProofBlastDto,
  ScheduleBlastDto,
  UpdateBlastDto,
} from "./dto/blast.dto";

// Blasts are an organiser/owner domain (member: read). Every id-scoped mutation also loads
// the blast through the tenant-scoped path in the service, so a caller can't touch another
// tenant's blast by id. `dispatch-due` is the platform cron (Bearer token, no session).
const READ = { action: "read", resource: "messaging.blast" } as const;
const MANAGE = { action: "manage", resource: "messaging.blast" } as const;

@Controller("blasts")
export class BlastsController {
  constructor(private readonly blasts: BlastsService) {}

  @Post()
  @RequirePermission(MANAGE)
  create(@TenantId() tenantId: string, @Body() dto: CreateBlastDto) {
    return this.blasts.createDraft(tenantId, dto);
  }

  @Patch(":id")
  @RequirePermission(MANAGE)
  update(@TenantId() tenantId: string, @Param("id") id: string, @Body() dto: UpdateBlastDto) {
    return this.blasts.updateDraft(tenantId, id, dto);
  }

  @Delete(":id")
  @RequirePermission(MANAGE)
  remove(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.blasts.deleteBlast(tenantId, id);
  }

  @Post(":id/proof-preview")
  @RequirePermission(MANAGE)
  proofPreview(@TenantId() tenantId: string, @Param("id") id: string, @Body() dto: ProofBlastDto) {
    return this.blasts.previewProof(tenantId, id, dto);
  }

  @Post(":id/proofed")
  @RequirePermission(MANAGE)
  markProofed(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.blasts.markProofed(tenantId, id);
  }

  @Post(":id/schedule")
  @RequirePermission(MANAGE)
  schedule(@TenantId() tenantId: string, @Param("id") id: string, @Body() dto: ScheduleBlastDto) {
    return this.blasts.schedule(tenantId, id, dto);
  }

  @Post(":id/send")
  @RequirePermission(MANAGE)
  sendNow(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.blasts.requestSendNow(tenantId, id);
  }

  // Platform cron (Bearer-token, no session) — dispatches due scheduled blasts across tenants.
  @Get("dispatch-due")
  @Post("dispatch-due")
  dispatchDue(@Query("limit") limit?: string) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.blasts.dispatchDueScheduled(parsedLimit);
  }

  @Post(":id/retry-failed")
  @RequirePermission(MANAGE)
  retryFailed(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.blasts.requestRetryFailed(tenantId, id);
  }

  @Get()
  @RequirePermission(READ)
  list(@TenantId() tenantId: string, @Query() _dto: ListBlastsDto) {
    return this.blasts.listBlasts(tenantId);
  }
}

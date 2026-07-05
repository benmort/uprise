import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { IntegrationConnectionStatus } from "@uprise/db";
import { IntegrationsService } from "./integrations.service";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantId } from "../auth/tenant-id.decorator";
import {
  SampleIntegrationListDto,
  SearchIntegrationListsDto,
  SyncIntegrationListDto,
  TestIntegrationConnectionDto,
  UpdateConnectionStatusDto,
  UpsertIntegrationConnectionDto,
} from "./dto/integration.dto";

// Integrations are an organiser surface. Reads + writes both require the integration
// ability (manage implies read in CASL). Previously undecorated — a latent auth gap.
const MANAGE = { action: "manage", resource: "integration.all" } as const;
const READ = { action: "read", resource: "integration.all" } as const;

@Controller("integrations")
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Post("connections")
  @RequirePermission(MANAGE)
  upsertConnection(@TenantId() tenantId: string, @Body() dto: UpsertIntegrationConnectionDto) {
    return this.integrations.upsertConnection(tenantId, dto);
  }

  @Post("connections/test")
  @RequirePermission(MANAGE)
  testConnection(@Body() dto: TestIntegrationConnectionDto) {
    return this.integrations.testConnection(dto);
  }

  // Disconnect / reconnect = status flip; DELETE removes the connection outright.
  @Patch("connections/:id")
  @RequirePermission(MANAGE)
  updateConnectionStatus(
    @TenantId() tenantId: string,
    @Param("id") id: string,
    @Body() dto: UpdateConnectionStatusDto,
  ) {
    return this.integrations.setConnectionStatus(tenantId, id, dto.status as IntegrationConnectionStatus);
  }

  @Delete("connections/:id")
  @RequirePermission(MANAGE)
  deleteConnection(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.integrations.deleteConnection(tenantId, id);
  }

  @Get("lists/search")
  @RequirePermission(READ)
  searchLists(@TenantId() tenantId: string, @Query() dto: SearchIntegrationListsDto) {
    return this.integrations.searchLists(tenantId, dto);
  }

  @Get("lists/sample")
  @RequirePermission(READ)
  sampleList(@TenantId() tenantId: string, @Query() dto: SampleIntegrationListDto) {
    return this.integrations.sampleList(tenantId, dto);
  }

  @Post("lists/sync")
  @RequirePermission(MANAGE)
  syncList(@TenantId() tenantId: string, @Body() dto: SyncIntegrationListDto) {
    return this.integrations.syncList(tenantId, dto);
  }

  @Get("sync-jobs")
  @RequirePermission(READ)
  syncJobs(@TenantId() tenantId: string, @Query("limit") limit?: string) {
    const n = Number(limit || "20");
    return this.integrations.getSyncJobs(tenantId, Number.isFinite(n) ? n : 20);
  }

  @Get("connections")
  @RequirePermission(READ)
  listConnections(@TenantId() tenantId: string) {
    return this.integrations.listConnections(tenantId);
  }
}

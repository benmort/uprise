import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { IntegrationConnectionStatus } from "@uprise/db";
import { IntegrationsService } from "./integrations.service";
import { CrmPushService } from "./crm-push.service";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantId } from "../auth/tenant-id.decorator";
import {
  SampleIntegrationListDto,
  SearchIntegrationListsDto,
  SyncIntegrationListDto,
  TestIntegrationConnectionDto,
  UpdateConnectionDataSyncDto,
  UpdateConnectionStatusDto,
  UpsertIntegrationConnectionDto,
} from "./dto/integration.dto";

// Integrations are an organiser surface. Reads + writes both require the integration
// ability (manage implies read in CASL). Previously undecorated — a latent auth gap.
const MANAGE = { action: "manage", resource: "integration.all" } as const;
const READ = { action: "read", resource: "integration.all" } as const;

@Controller("integrations")
export class IntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly crmPush: CrmPushService,
  ) {}

  @Post("connections")
  @RequirePermission(MANAGE)
  upsertConnection(@TenantId() tenantId: string, @Body() dto: UpsertIntegrationConnectionDto) {
    return this.integrations.upsertConnection(tenantId, dto);
  }

  @Post("connections/test")
  @RequirePermission(MANAGE)
  testConnection(@TenantId() tenantId: string, @Body() dto: TestIntegrationConnectionDto) {
    return this.integrations.testConnection(tenantId, dto);
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

  // Data-sync settings (pull auto-refresh + tag import; push master switch, streams,
  // support-level toggle). Partial patch — absent fields keep their stored value.
  @Patch("connections/:id/settings")
  @RequirePermission(MANAGE)
  updateDataSyncSettings(
    @TenantId() tenantId: string,
    @Param("id") id: string,
    @Body() dto: UpdateConnectionDataSyncDto,
  ) {
    return this.integrations.updateDataSyncSettings(tenantId, id, dto);
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

  // Cron sweep (Bearer CRON_SECRET via isCronDispatchPath — no session, no tenant):
  // re-syncs provider audiences whose connection asks for auto-refresh. Mirrors
  // /audiences/dispatch-imports' GET+POST shape so either cron verb works.
  @Get("dispatch-refresh")
  @Post("dispatch-refresh")
  dispatchRefresh(@Query("limit") limit?: string) {
    const n = Number(limit || "20");
    return this.integrations.dispatchDueRefreshes(Number.isFinite(n) ? n : 20);
  }

  @Get("connections")
  @RequirePermission(READ)
  listConnections(@TenantId() tenantId: string) {
    return this.integrations.listConnections(tenantId);
  }

  // ── CRM push transparency — the Sync activity surface ─────────────────────

  @Get("push-deliveries")
  @RequirePermission(READ)
  listPushDeliveries(
    @TenantId() tenantId: string,
    @Query("connectionId") connectionId?: string,
    @Query("stream") stream?: string,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.crmPush.listDeliveries(tenantId, {
      connectionId,
      stream,
      status,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get("push-deliveries/summary")
  @RequirePermission(READ)
  pushDeliverySummary(@TenantId() tenantId: string, @Query("sinceHours") sinceHours?: string) {
    const n = Number(sinceHours || "24");
    return this.crmPush.deliverySummary(tenantId, Number.isFinite(n) ? n : 24);
  }

  @Post("push-deliveries/:id/retry")
  @RequirePermission(MANAGE)
  retryPushDelivery(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.crmPush.retryDelivery(tenantId, id);
  }

  // Cron sweep (Bearer CRON_SECRET via isCronDispatchPath): re-enqueues stranded
  // deliveries + releases HELD rows on reconnected connections. GET+POST like the
  // other dispatch endpoints so either cron verb works.
  @Get("crm-push/sweep")
  @Post("crm-push/sweep")
  crmPushSweep(@Query("limit") limit?: string) {
    const n = Number(limit || "500");
    return this.crmPush.sweepPushDeliveries(Number.isFinite(n) ? n : 500);
  }
}

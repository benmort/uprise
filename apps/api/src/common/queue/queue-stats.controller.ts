import { Controller, Get, Req } from "@nestjs/common";
import type { Request } from "express";
import { RequirePermission } from "../../auth/require-permission.decorator";
import type { AuthUser } from "../../auth/auth-user";
import { QueueStatsService } from "./queue-stats.service";
import { TenantActivityService } from "./tenant-activity.service";

// `system.queue-stats` is granted to no tenant role, so only super-admin (`manage all`)
// satisfies it — this locks both the global infra stats and the per-tenant activity view
// to super-admin, defence-in-depth behind the super-admin-gated /settings UI.
const SUPER_ADMIN = { action: "read", resource: "system.queue-stats" } as const;

@Controller("system")
export class QueueStatsController {
  constructor(
    private readonly queueStats: QueueStatsService,
    private readonly tenantActivity: TenantActivityService,
  ) {}

  /** Global BullMQ + Redis infra stats (platform-wide, unscoped). Super-admin only. */
  @Get("queue-stats")
  @RequirePermission(SUPER_ADMIN)
  getQueueStats() {
    return this.queueStats.getStats();
  }

  /** Per-tenant async-work health, aggregated from the caller's tenant domain tables. */
  @Get("tenant-activity")
  @RequirePermission(SUPER_ADMIN)
  getTenantActivity(@Req() req: Request & { user?: AuthUser }) {
    return this.tenantActivity.getTenantActivity(req.user?.tenantId ?? "");
  }
}

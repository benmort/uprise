import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ActionsService } from "./actions.service";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantId } from "../auth/tenant-id.decorator";
import { CreateActionPageDto, ListActionPagesQueryDto, UpdateActionPageDto } from "./dto/actions.dto";

// Action pages are an organiser/owner surface: `manage actions.all` (owner +
// organiser) and `read actions.all` (member). The public widget surface is
// PublicActionsController, allowlisted separately.
const READ = { action: "read", resource: "actions.page" } as const;
const MANAGE = { action: "manage", resource: "actions.page" } as const;

@Controller("actions/pages")
export class ActionsController {
  constructor(private readonly actions: ActionsService) {}

  @Get()
  @RequirePermission(READ)
  list(@TenantId() tenantId: string, @Query() query: ListActionPagesQueryDto) {
    return this.actions.list(tenantId, query);
  }

  @Post()
  @RequirePermission(MANAGE)
  create(@TenantId() tenantId: string, @Body() dto: CreateActionPageDto) {
    return this.actions.create(tenantId, dto.title);
  }

  @Get(":id")
  @RequirePermission(READ)
  get(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.actions.get(tenantId, id);
  }

  @Patch(":id")
  @RequirePermission(MANAGE)
  update(@TenantId() tenantId: string, @Param("id") id: string, @Body() dto: UpdateActionPageDto) {
    return this.actions.update(tenantId, id, dto);
  }

  @Post(":id/publish")
  @RequirePermission(MANAGE)
  publish(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.actions.publish(tenantId, id);
  }

  @Post(":id/unpublish")
  @RequirePermission(MANAGE)
  unpublish(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.actions.unpublish(tenantId, id);
  }

  @Post(":id/archive")
  @RequirePermission(MANAGE)
  archive(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.actions.archive(tenantId, id);
  }

  @Post(":id/restore")
  @RequirePermission(MANAGE)
  restore(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.actions.restore(tenantId, id);
  }

  @Post(":id/preview-token")
  @RequirePermission(MANAGE)
  previewToken(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.actions.previewToken(tenantId, id);
  }

  @Get(":id/results")
  @RequirePermission(READ)
  results(
    @TenantId() tenantId: string,
    @Param("id") id: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.actions.results(tenantId, id, {
      limit: Math.min(Math.max(1, Number(limit) || 20), 100),
      offset: Math.max(0, Number(offset) || 0),
    });
  }
}

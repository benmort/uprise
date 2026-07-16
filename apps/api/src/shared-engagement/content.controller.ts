import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ContentObjectType, ContentType } from "@uprise/db";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantId } from "../auth/tenant-id.decorator";
import { ContentService } from "./content.service";
import {
  CreateCannedSetDto,
  CreateContentBindingDto,
  CreateDispositionSetDto,
  UpdateCannedSetDto,
  UpdateDispositionSetDto,
} from "./dto/content.dto";

// Authoring/binding is organiser-owned (`manage canvass.content`, granted via
// `manage canvass.all`). The flow + binding reads use `read canvass.script` so the
// field volunteer app (which already holds it) can resolve an object's flow.
const CONTENT_MANAGE = { action: "manage", resource: "canvass.content" } as const;
const CONTENT_READ = { action: "read", resource: "canvass.content" } as const;
const FLOW_READ = { action: "read", resource: "canvass.script" } as const;

@Controller("engagement")
export class ContentController {
  constructor(private readonly content: ContentService) {}

  // ── Bindings ─────────────────────────────────────────────────
  @Post("bindings")
  @RequirePermission(CONTENT_MANAGE)
  async createBinding(@TenantId() tenantId: string, @Body() dto: CreateContentBindingDto) {
    return this.content.createBinding(tenantId, dto);
  }

  @Delete("bindings/:id")
  @RequirePermission(CONTENT_MANAGE)
  async deleteBinding(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.content.deleteBinding(tenantId, id);
  }

  @Get("bindings")
  @RequirePermission(FLOW_READ)
  async listBindings(
    @TenantId() tenantId: string,
    @Query("objectType") objectType: ContentObjectType,
    @Query("objectId") objectId: string,
  ) {
    return this.content.listBindings(tenantId, objectType, objectId);
  }

  @Get("flow")
  @RequirePermission(FLOW_READ)
  async flow(
    @TenantId() tenantId: string,
    @Query("objectType") objectType: ContentObjectType,
    @Query("objectId") objectId: string,
  ) {
    return this.content.resolveFlow(tenantId, objectType, objectId);
  }

  @Get("content/:type/:id/usage")
  @RequirePermission(CONTENT_READ)
  async usage(@TenantId() tenantId: string, @Param("type") type: ContentType, @Param("id") id: string) {
    return this.content.usage(tenantId, type, id);
  }

  // ── Disposition sets ─────────────────────────────────────────
  @Get("disposition-sets")
  @RequirePermission(CONTENT_READ)
  async listDispositionSets(@TenantId() tenantId: string) {
    return this.content.listDispositionSets(tenantId);
  }

  @Get("disposition-sets/:id")
  @RequirePermission(CONTENT_READ)
  async getDispositionSet(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.content.getDispositionSet(tenantId, id);
  }

  @Post("disposition-sets")
  @RequirePermission(CONTENT_MANAGE)
  async createDispositionSet(@TenantId() tenantId: string, @Body() dto: CreateDispositionSetDto) {
    return this.content.createDispositionSet(tenantId, dto);
  }

  @Patch("disposition-sets/:id")
  @RequirePermission(CONTENT_MANAGE)
  async updateDispositionSet(@TenantId() tenantId: string, @Param("id") id: string, @Body() dto: UpdateDispositionSetDto) {
    return this.content.updateDispositionSet(tenantId, id, dto);
  }

  @Delete("disposition-sets/:id")
  @RequirePermission(CONTENT_MANAGE)
  async deleteDispositionSet(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.content.deleteDispositionSet(tenantId, id);
  }

  // ── Canned sets ──────────────────────────────────────────────
  @Get("canned-sets")
  @RequirePermission(CONTENT_READ)
  async listCannedSets(@TenantId() tenantId: string) {
    return this.content.listCannedSets(tenantId);
  }

  @Get("canned-sets/:id")
  @RequirePermission(CONTENT_READ)
  async getCannedSet(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.content.getCannedSet(tenantId, id);
  }

  @Post("canned-sets")
  @RequirePermission(CONTENT_MANAGE)
  async createCannedSet(@TenantId() tenantId: string, @Body() dto: CreateCannedSetDto) {
    return this.content.createCannedSet(tenantId, dto);
  }

  @Patch("canned-sets/:id")
  @RequirePermission(CONTENT_MANAGE)
  async updateCannedSet(@TenantId() tenantId: string, @Param("id") id: string, @Body() dto: UpdateCannedSetDto) {
    return this.content.updateCannedSet(tenantId, id, dto);
  }

  @Delete("canned-sets/:id")
  @RequirePermission(CONTENT_MANAGE)
  async deleteCannedSet(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.content.deleteCannedSet(tenantId, id);
  }
}

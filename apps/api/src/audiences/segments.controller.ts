import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { describeConditions, type ComplianceChannel } from "@uprise/segmentation";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantId } from "../auth/tenant-id.decorator";
import type { AuthUser } from "../auth/auth-user";
import { SegmentsService } from "./segments.service";
import { SegmentPreviewService } from "./segment-preview.service";
import { SegmentAuthoringService } from "./segment-authoring.service";
import { CustomQueryService } from "./custom-query.service";
import {
  CompileCustomClauseDto,
  CreateSegmentDto,
  GenerateSegmentDto,
  PreviewSegmentDto,
  UpdateSegmentDto,
} from "./dto/segment.dto";
import {
  SegmentCustomClauseSchema,
  SegmentPolicySchema,
  DEFAULT_SEGMENT_POLICY,
  FilterNodeSchema,
  validateAuthoredFilter,
} from "@uprise/segmentation";
import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

const READ = { action: "read", resource: "audience.segment" } as const;
const MANAGE = { action: "manage", resource: "audience.segment" } as const;

/**
 * Engine-v2 segment definitions — the real backend behind the segment builder
 * (catalogue, CRUD, live preview, AI authoring, the custom-query lane).
 * Organiser/owner domain, gated per-route on `audience.segment`.
 */
@Controller("segments")
export class SegmentsController {
  constructor(
    private readonly segments: SegmentsService,
    private readonly preview: SegmentPreviewService,
    private readonly authoring: SegmentAuthoringService,
    private readonly customQuery: CustomQueryService,
  ) {}

  private userId(req: Request & { user?: AuthUser }): string | null {
    return req.user?.id ?? null;
  }

  /** The condition catalogue + this tenant's entity-picker feeds. */
  @Get("catalogue")
  @RequirePermission(READ)
  async catalogue(@TenantId() tenantId: string) {
    const described = describeConditions("blast");
    const feeds = await this.segments.entityFeeds(tenantId);
    return { ...described, feeds };
  }

  @Get()
  @RequirePermission(READ)
  async list(@TenantId() tenantId: string) {
    return this.segments.list(tenantId);
  }

  @Get(":id")
  @RequirePermission(READ)
  async get(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.segments.get(tenantId, id);
  }

  @Post()
  @RequirePermission(MANAGE)
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateSegmentDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.segments.create(tenantId, this.userId(req), dto);
  }

  @Patch(":id")
  @RequirePermission(MANAGE)
  async update(@TenantId() tenantId: string, @Param("id") id: string, @Body() dto: UpdateSegmentDto) {
    return this.segments.update(tenantId, id, dto);
  }

  @Patch(":id/archive")
  @RequirePermission(MANAGE)
  async archive(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.segments.archive(tenantId, id);
  }

  @Patch(":id/restore")
  @RequirePermission(MANAGE)
  async restore(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.segments.restore(tenantId, id);
  }

  /** Live preview of an UNSAVED spec — the builder calls this debounced. */
  @Post("preview")
  @RequirePermission(READ)
  async previewSpec(@TenantId() tenantId: string, @Body() dto: PreviewSegmentDto) {
    const policy = SegmentPolicySchema.safeParse(dto.policy ?? DEFAULT_SEGMENT_POLICY);
    if (!policy.success) {
      throw new BadRequestException({ code: "SEGMENT_POLICY_INVALID", detail: policy.error.message });
    }
    const clauses = z.array(SegmentCustomClauseSchema).max(20).safeParse(dto.customClauses ?? []);
    if (!clauses.success) {
      throw new BadRequestException({ code: "SEGMENT_CLAUSES_INVALID", detail: clauses.error.message });
    }
    const verdict = validateAuthoredFilter(dto.filter, {
      customClauseIds: new Set(clauses.data.map((c) => c.id)),
    });
    if (!verdict.ok) {
      throw new BadRequestException({
        code: "SEGMENT_FILTER_INVALID",
        reason: verdict.reason,
        type: verdict.type,
        detail: verdict.detail,
      });
    }
    return this.preview.preview(tenantId, {
      filter: FilterNodeSchema.parse(dto.filter),
      policy: policy.data,
      customClauses: clauses.data,
      channel: dto.channel as ComplianceChannel | undefined,
      seed: dto.seed,
    });
  }

  @Post(":id/evaluate")
  @RequirePermission(MANAGE)
  async evaluate(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.segments.evaluate(tenantId, id);
  }

  /** AI prompt-to-segment (deterministic keyword fallback when AI is off). */
  @Post("generate")
  @RequirePermission(MANAGE)
  async generate(@Body() dto: GenerateSegmentDto) {
    return this.authoring.generateFromPrompt(dto.prompt);
  }

  /** The AI custom-query lane: intent → validated predicate + live count. */
  @Post("custom-query/compile")
  @RequirePermission(MANAGE)
  async compileCustomQuery(@TenantId() tenantId: string, @Body() dto: CompileCustomClauseDto) {
    return this.customQuery.compileCustomClause(tenantId, dto.intent);
  }
}

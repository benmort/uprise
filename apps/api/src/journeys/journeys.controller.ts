import { Body, Controller, Delete, Get, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JourneyEnrolmentState, JourneyStatus, Prisma } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { ApiHttpException } from "../common/http/api-response";
import { JourneysService } from "./journeys.service";
import {
  CreateJourneyDto,
  DryRunJourneyDto,
  UpdateJourneyDto,
  UpdateJourneyStatusDto,
} from "./dto/journey.dto";

// Human-readable summary of a rung for the dry-run path preview.
const RUNG_LABEL: Record<string, string> = {
  wait: "Wait",
  condition: "If condition holds",
  action: "Do action",
};

@Controller("journeys")
export class JourneysController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly journeys: JourneysService,
  ) {}

  private async ensureOrganization() {
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    return this.prisma.tenant.upsert({
      where: { slug },
      create: { slug, name: "Default Organization" },
      update: {},
    });
  }

  @Get()
  async list() {
    const org = await this.ensureOrganization();
    return this.prisma.journey.findMany({
      where: { tenantId: org.id },
      include: { rungs: { orderBy: { rungIndex: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
  }

  @Post()
  async create(@Body() dto: CreateJourneyDto) {
    const org = await this.ensureOrganization();
    return this.prisma.journey.create({
      data: {
        tenantId: org.id,
        name: dto.name,
        triggerType: dto.triggerType,
        triggerConfig: (dto.triggerConfig ?? {}) as Prisma.InputJsonValue,
        reentryCooldownMinutes: dto.reentryCooldownMinutes ?? 0,
        maxActivePerContact: dto.maxActivePerContact ?? 1,
        rungs: dto.rungs
          ? {
              create: dto.rungs.map((r, i) => ({
                rungIndex: r.rungIndex ?? i,
                type: r.type,
                config: (r.config ?? {}) as Prisma.InputJsonValue,
              })),
            }
          : undefined,
      },
      include: { rungs: { orderBy: { rungIndex: "asc" } } },
    });
  }

  @Patch(":id/status")
  async setStatus(@Param("id") id: string, @Body() dto: UpdateJourneyStatusDto) {
    const org = await this.ensureOrganization();
    return this.prisma.journey.updateMany({
      where: { id, tenantId: org.id },
      data: { status: dto.status as JourneyStatus },
    });
  }

  /** Update journey config; when `rungs` is provided, replace them transactionally. */
  @Patch(":id")
  async update(@Param("id") id: string, @Body() dto: UpdateJourneyDto) {
    const org = await this.ensureOrganization();
    const existing = await this.prisma.journey.findFirst({ where: { id, tenantId: org.id } });
    if (!existing) throw new ApiHttpException("JOURNEY_NOT_FOUND", "Journey not found", HttpStatus.NOT_FOUND);

    return this.prisma.$transaction(async (tx) => {
      await tx.journey.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.triggerType !== undefined ? { triggerType: dto.triggerType } : {}),
          ...(dto.triggerConfig !== undefined
            ? { triggerConfig: dto.triggerConfig as Prisma.InputJsonValue }
            : {}),
          ...(dto.reentryCooldownMinutes !== undefined
            ? { reentryCooldownMinutes: dto.reentryCooldownMinutes }
            : {}),
          ...(dto.maxActivePerContact !== undefined
            ? { maxActivePerContact: dto.maxActivePerContact }
            : {}),
        },
      });
      if (dto.rungs) {
        await tx.journeyRung.deleteMany({ where: { journeyId: id } });
        await tx.journeyRung.createMany({
          data: dto.rungs.map((r, i) => ({
            journeyId: id,
            rungIndex: r.rungIndex ?? i,
            type: r.type,
            config: (r.config ?? {}) as Prisma.InputJsonValue,
          })),
        });
      }
      return tx.journey.findUnique({
        where: { id },
        include: { rungs: { orderBy: { rungIndex: "asc" } } },
      });
    });
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    const org = await this.ensureOrganization();
    const res = await this.prisma.journey.deleteMany({ where: { id, tenantId: org.id } });
    if (res.count === 0) throw new ApiHttpException("JOURNEY_NOT_FOUND", "Journey not found", HttpStatus.NOT_FOUND);
    return { deleted: true };
  }

  /** Enrolment funnel: enrolled / active / completed / exited + conversion %. */
  @Get(":id/stats")
  async stats(@Param("id") id: string) {
    const org = await this.ensureOrganization();
    const journey = await this.prisma.journey.findFirst({ where: { id, tenantId: org.id } });
    if (!journey) throw new ApiHttpException("JOURNEY_NOT_FOUND", "Journey not found", HttpStatus.NOT_FOUND);
    const grouped = await this.prisma.journeyEnrolment.groupBy({
      by: ["state"],
      where: { journeyId: id },
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    let enrolled = 0;
    for (const g of grouped) {
      counts[g.state] = g._count._all;
      enrolled += g._count._all;
    }
    const completed = counts[JourneyEnrolmentState.COMPLETED] ?? 0;
    return {
      enrolled,
      active: counts[JourneyEnrolmentState.ACTIVE] ?? 0,
      waiting: counts[JourneyEnrolmentState.WAITING] ?? 0,
      completed,
      exited: counts[JourneyEnrolmentState.EXITED] ?? 0,
      failed: counts[JourneyEnrolmentState.FAILED] ?? 0,
      conversionPct: enrolled > 0 ? Math.round((completed / enrolled) * 100) : 0,
    };
  }

  /** Static path preview: the ordered rungs the journey would run, with labels. */
  @Post(":id/dry-run")
  async dryRun(@Param("id") id: string, @Body() _dto: DryRunJourneyDto) {
    const org = await this.ensureOrganization();
    const journey = await this.prisma.journey.findFirst({
      where: { id, tenantId: org.id },
      include: { rungs: { orderBy: { rungIndex: "asc" } } },
    });
    if (!journey) throw new ApiHttpException("JOURNEY_NOT_FOUND", "Journey not found", HttpStatus.NOT_FOUND);
    return {
      trigger: { type: journey.triggerType, config: journey.triggerConfig },
      steps: journey.rungs.map((r) => ({
        rungIndex: r.rungIndex,
        type: r.type,
        label: RUNG_LABEL[r.type] ?? r.type,
        config: r.config,
      })),
    };
  }

  // Cron-driven: resumes WAITING enrolments whose wait has elapsed.
  @Get("sweep-due")
  @Post("sweep-due")
  sweepDue(@Query("limit") limit?: string) {
    return this.journeys.sweepDue(limit ? Number(limit) : undefined);
  }
}

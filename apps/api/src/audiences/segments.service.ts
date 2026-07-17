import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  AudienceChannel,
  AudienceKind,
  AudienceSegmentType,
  AudienceSource,
  AudienceStatus,
} from "@uprise/db";
import {
  DEFAULT_SEGMENT_POLICY,
  describeTree,
  listUnsupportedConditions,
  SegmentCustomClauseSchema,
  SegmentPolicySchema,
  validateAuthoredFilter,
  FilterNodeSchema,
  type FilterNode,
  type SegmentCustomClause,
  type SegmentDefinitionV2,
  type SegmentPolicy,
} from "@uprise/segmentation";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { DispatchQueue } from "../common/queue/dispatch-queue";
import { DISPATCH_QUEUE_TOKEN } from "../common/queue/queue.tokens";
import { getSegmentEvalJobId, QUEUE_JOB_TYPES, QUEUE_NAMES } from "../common/queue/queue.constants";
import {
  CUSTOM_QUERY_ROW_CAP,
  CustomQueryService,
} from "./custom-query.service";
import { validateContactsSafePredicate } from "./custom-query-predicate.validator";

interface SegmentInput {
  name?: string;
  channel?: "SMS" | "WHATSAPP" | "ALL";
  filter?: unknown;
  policy?: unknown;
  customClauses?: unknown;
}

const CustomClausesSchema = z.array(SegmentCustomClauseSchema).max(20);

/**
 * Engine-v2 segment CRUD — audience DEFINITIONS over the contact spine, saved
 * as the v2 envelope on `AudienceSegment.definition`.
 *
 * The container-audience pattern: every v2 segment owns a dedicated
 * `Audience { kind: DYNAMIC_SEGMENT }` row (one audience ↔ one segment), so
 * blasts target segments through the existing audience picker with zero
 * targeting-model changes, and the audience dashboard keeps working as-is.
 *
 * Save-time gates, in order: scalar DTO validation (controller) → Zod parses of
 * policy/clauses → AST validation of every custom-clause predicate →
 * `validateAuthoredFilter` (bounds/closure/layer authority + clause refs) → the
 * catalogue capability gate. Every state write emits its domain event in the
 * same transaction.
 */
@Injectable()
export class SegmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly customQuery: CustomQueryService,
    @Inject(DISPATCH_QUEUE_TOKEN) private readonly queue: DispatchQueue,
  ) {}

  // ── validation ─────────────────────────────────────────────────────────
  private parseEnvelope(input: SegmentInput): {
    filter: FilterNode;
    policy: SegmentPolicy;
    customClauses: SegmentCustomClause[];
  } {
    const policyParse = SegmentPolicySchema.safeParse(input.policy ?? DEFAULT_SEGMENT_POLICY);
    if (!policyParse.success) {
      throw new BadRequestException({ code: "SEGMENT_POLICY_INVALID", detail: policyParse.error.message });
    }
    const clausesParse = CustomClausesSchema.safeParse(input.customClauses ?? []);
    if (!clausesParse.success) {
      throw new BadRequestException({ code: "SEGMENT_CLAUSES_INVALID", detail: clausesParse.error.message });
    }
    // Every stored clause predicate must pass the AST allowlist NOW — a clause
    // that can't be executed is refused at save, not discovered at send time.
    for (const clause of clausesParse.data) {
      const validation = validateContactsSafePredicate(clause.predicate, CUSTOM_QUERY_ROW_CAP);
      if (!validation.ok) {
        throw new BadRequestException({
          code: "SEGMENT_CLAUSE_PREDICATE_INVALID",
          clauseId: clause.id,
          reasons: validation.reasons,
        });
      }
    }

    const filterVerdict = validateAuthoredFilter(input.filter, {
      customClauseIds: new Set(clausesParse.data.map((c) => c.id)),
    });
    if (!filterVerdict.ok) {
      throw new BadRequestException({
        code: "SEGMENT_FILTER_INVALID",
        reason: filterVerdict.reason,
        type: filterVerdict.type,
        detail: filterVerdict.detail,
      });
    }
    const filter = FilterNodeSchema.parse(input.filter);

    // Capability gate — pending/gated catalogue entries are advertised, never saved.
    const unsupported = listUnsupportedConditions(filter);
    if (unsupported.length > 0) {
      throw new BadRequestException({
        code: "SEGMENT_CONDITION_UNSUPPORTED",
        conditions: unsupported,
      });
    }

    return { filter, policy: policyParse.data, customClauses: clausesParse.data };
  }

  private toEnvelope(
    filter: FilterNode,
    policy: SegmentPolicy,
    customClauses: SegmentCustomClause[],
  ): SegmentDefinitionV2 {
    return {
      format: 2,
      filter,
      policy,
      ...(customClauses.length ? { customClauses } : {}),
    };
  }

  private enqueueEvaluation(segmentId: string): Promise<unknown> {
    // Stable jobId collapses duplicate evals from rapid edits / event replays.
    return this.queue.enqueue({
      id: getSegmentEvalJobId(segmentId),
      queue: QUEUE_NAMES.SEGMENT_EVAL,
      type: QUEUE_JOB_TYPES.SEGMENT_EVAL_RUN,
      payload: { segmentId },
      removeOnComplete: true,
    });
  }

  // ── CRUD ───────────────────────────────────────────────────────────────
  async create(tenantId: string, userId: string | null, input: SegmentInput) {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException({ code: "SEGMENT_NAME_REQUIRED" });
    const { filter, policy, customClauses } = this.parseEnvelope(input);
    const channel =
      input.channel === "SMS"
        ? AudienceChannel.SMS
        : input.channel === "WHATSAPP"
          ? AudienceChannel.WHATSAPP
          : AudienceChannel.ALL;

    const segment = await this.prisma.$transaction(async (tx) => {
      const audience = await tx.audience.create({
        data: {
          tenantId,
          name,
          source: AudienceSource.INTERNAL,
          channel,
          kind: AudienceKind.DYNAMIC_SEGMENT,
          createdById: userId,
        },
      });
      const created = await tx.audienceSegment.create({
        data: {
          tenantId,
          audienceId: audience.id,
          name,
          type: AudienceSegmentType.DYNAMIC,
          definition: this.toEnvelope(filter, policy, customClauses) as object,
          seed: randomUUID(),
          version: 1,
          createdById: userId,
        },
      });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "audience.segment.created",
        aggregateId: created.id,
        payload: { segmentId: created.id, audienceId: audience.id, tenantId },
      });
      return created;
    });

    await this.enqueueEvaluation(segment.id);
    return this.get(tenantId, segment.id);
  }

  async list(tenantId: string) {
    const segments = await this.prisma.audienceSegment.findMany({
      where: { tenantId, audience: { kind: AudienceKind.DYNAMIC_SEGMENT } },
      include: { _count: { select: { members: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return segments.map((s) => this.toSummary(s));
  }

  async get(tenantId: string, id: string) {
    const segment = await this.prisma.audienceSegment.findFirst({
      where: { id, tenantId, audience: { kind: AudienceKind.DYNAMIC_SEGMENT } },
      include: { _count: { select: { members: true } } },
    });
    if (!segment) throw new NotFoundException(`Segment ${id} not found`);
    const envelope = segment.definition as unknown as SegmentDefinitionV2;
    return {
      ...this.toSummary(segment),
      filter: envelope.filter,
      policy: envelope.policy,
      customClauses: envelope.customClauses ?? [],
    };
  }

  async update(tenantId: string, id: string, input: SegmentInput) {
    const existing = await this.prisma.audienceSegment.findFirst({
      where: { id, tenantId, audience: { kind: AudienceKind.DYNAMIC_SEGMENT } },
      select: { id: true, audienceId: true, version: true, definition: true, name: true },
    });
    if (!existing) throw new NotFoundException(`Segment ${id} not found`);

    const current = existing.definition as unknown as SegmentDefinitionV2;
    const { filter, policy, customClauses } = this.parseEnvelope({
      filter: input.filter ?? current.filter,
      policy: input.policy ?? current.policy,
      customClauses: input.customClauses ?? current.customClauses ?? [],
    });
    const name = input.name?.trim() || existing.name;
    const version = existing.version + 1;

    await this.prisma.$transaction(async (tx) => {
      await tx.audienceSegment.update({
        where: { id },
        data: {
          name,
          version,
          definition: this.toEnvelope(filter, policy, customClauses) as object,
        },
      });
      // The container audience mirrors the segment's name in the audience picker.
      await tx.audience.update({ where: { id: existing.audienceId }, data: { name } });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "audience.segment.updated",
        aggregateId: id,
        payload: { segmentId: id, tenantId, version },
      });
    });

    await this.enqueueEvaluation(id);
    return this.get(tenantId, id);
  }

  private async setArchived(tenantId: string, id: string, archived: boolean) {
    const existing = await this.prisma.audienceSegment.findFirst({
      where: { id, tenantId, audience: { kind: AudienceKind.DYNAMIC_SEGMENT } },
      select: { id: true, audienceId: true },
    });
    if (!existing) throw new NotFoundException(`Segment ${id} not found`);
    await this.prisma.$transaction(async (tx) => {
      await tx.audienceSegment.update({
        where: { id },
        data: { archivedAt: archived ? new Date() : null },
      });
      await tx.audience.update({
        where: { id: existing.audienceId },
        data: {
          status: archived ? AudienceStatus.ARCHIVED : AudienceStatus.ACTIVE,
          archivedAt: archived ? new Date() : null,
        },
      });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "audience.segment.archived",
        aggregateId: id,
        payload: { segmentId: id, tenantId, archived },
      });
    });
    return this.get(tenantId, id);
  }

  archive(tenantId: string, id: string) {
    return this.setArchived(tenantId, id, true);
  }

  restore(tenantId: string, id: string) {
    return this.setArchived(tenantId, id, false);
  }

  /** Manual re-materialisation (the builder's "refresh count" action). */
  async evaluate(tenantId: string, id: string) {
    const existing = await this.prisma.audienceSegment.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`Segment ${id} not found`);
    await this.enqueueEvaluation(id);
    return { queued: true };
  }

  // ── the catalogue's tenant entity feeds ────────────────────────────────
  /** Per-tenant option feeds the builder's pickers hydrate from (tags, turfs, …). */
  async entityFeeds(tenantId: string) {
    const [tags, turfs, surveys, questions, events, blasts, journeys, dispositions, sources] =
      await Promise.all([
        this.prisma.contactTag.findMany({
          where: { tenantId },
          select: { id: true, label: true },
          orderBy: { label: "asc" },
        }),
        this.prisma.turf.findMany({
          where: { tenantId },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        this.prisma.survey.findMany({
          where: { tenantId },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        this.prisma.question.findMany({
          where: { survey: { tenantId } },
          select: {
            id: true,
            prompt: true,
            surveyId: true,
            options: { select: { value: true, label: true }, orderBy: { orderIndex: "asc" } },
          },
        }),
        this.prisma.event.findMany({
          where: { tenantId },
          select: { id: true, title: true },
          orderBy: { startsAt: "desc" },
          take: 200,
        }),
        this.prisma.blast.findMany({
          where: { tenantId },
          select: { id: true, title: true },
          orderBy: { createdAt: "desc" },
          take: 200,
        }),
        this.prisma.journey.findMany({
          where: { tenantId },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        this.prisma.dispositionDef.findMany({
          where: { tenantId },
          select: { code: true, label: true },
          orderBy: { label: "asc" },
        }),
        this.prisma.contactSourceRecord.findMany({
          where: { tenantId },
          select: { sourceSystem: true },
          distinct: ["sourceSystem"],
        }),
      ]);
    return {
      tags: tags.map((t) => ({ value: t.id, label: t.label })),
      turfs: turfs.map((t) => ({ value: t.id, label: t.name })),
      surveys: surveys.map((s) => ({ value: s.id, label: s.name })),
      questions: questions.map((q) => ({
        value: q.id,
        label: q.prompt,
        surveyId: q.surveyId,
        options: q.options,
      })),
      events: events.map((e) => ({ value: e.id, label: e.title })),
      blasts: blasts.map((b) => ({ value: b.id, label: b.title })),
      journeys: journeys.map((j) => ({ value: j.id, label: j.name })),
      dispositions: dispositions.map((d) => ({ value: d.code, label: d.label })),
      sources: sources.map((s) => ({ value: s.sourceSystem, label: s.sourceSystem })),
    };
  }

  // ── shaping ────────────────────────────────────────────────────────────
  private toSummary(segment: {
    id: string;
    audienceId: string;
    name: string;
    definition: unknown;
    version: number;
    seed: string | null;
    archivedAt: Date | null;
    lastEvaluatedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    _count?: { members: number };
  }) {
    const envelope = segment.definition as Partial<SegmentDefinitionV2>;
    return {
      id: segment.id,
      audienceId: segment.audienceId,
      name: segment.name,
      version: segment.version,
      archived: segment.archivedAt != null,
      lastEvaluatedAt: segment.lastEvaluatedAt,
      memberCount: segment._count?.members ?? 0,
      summary: envelope.filter ? describeTree(envelope.filter as FilterNode) : "",
      policy: envelope.policy ?? null,
      customClauseCount: envelope.customClauses?.length ?? 0,
      createdAt: segment.createdAt,
      updatedAt: segment.updatedAt,
    };
  }
}

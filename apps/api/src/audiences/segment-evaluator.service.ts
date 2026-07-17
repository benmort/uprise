import { Injectable, NotFoundException } from "@nestjs/common";
import {
  composeEffectiveTree,
  collectEffectiveLeaves,
  detectDefinitionFormat,
  foldEffectiveTree,
  SegmentDefinitionV2Schema,
  type ComplianceChannel,
  type SegmentDefinitionV2,
} from "@uprise/segmentation";
import { PrismaService } from "../prisma/prisma.service";
import { DomainLogger } from "../common/logging/domain-logger.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { InsightsService } from "../insights/insights.service";
import { LegacyClauseEvaluator } from "./legacy-clause-evaluator";
import { SegmentLeafResolverService } from "./segment-leaf-resolver.service";

/**
 * Dynamic-segment evaluator (meld doc 10) — the format ROUTER. Resolves which
 * Contacts belong to an `AudienceSegment` from its `definition` and
 * **wholesale-rewrites** `AudienceSegmentMember` so every evaluation is
 * authoritative (stale members dropped).
 *
 * Two definition formats, shape-detected:
 * - **legacy** (no `format` key) — the original clause language, evaluated by
 *   {@link LegacyClauseEvaluator}, byte-for-byte the old behaviour. Existing
 *   stored definitions never migrate.
 * - **v2** (`{ format: 2, filter, policy, customClauses? }`) — the slingshot-
 *   ported engine: compose `all(L1, L2, L3)` for the blast context, resolve
 *   every leaf via {@link SegmentLeafResolverService} (fail-closed ∅), fold the
 *   set algebra, and materialise the SENDABLE set.
 *
 * Everything is tenant-scoped via the segment's `tenantId`; the membership
 * rewrite + `audience.segment.recomputed` outbox event are atomic.
 */
@Injectable()
export class SegmentEvaluatorService {
  private readonly legacy: LegacyClauseEvaluator;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: DomainLogger,
    private readonly outbox: OutboxService,
    private readonly insights: InsightsService,
    /** Optional so the long-standing legacy spec (4-arg construction) stands; Nest always injects it. */
    private readonly leafResolver?: SegmentLeafResolverService,
  ) {
    this.legacy = new LegacyClauseEvaluator(prisma, insights);
  }

  /** Re-materialise a segment's membership. Returns the resolved member count. */
  async evaluate(segmentId: string): Promise<{ count: number }> {
    const segment = await this.prisma.audienceSegment.findUnique({
      where: { id: segmentId },
      select: {
        id: true,
        tenantId: true,
        definition: true,
        audience: { select: { channel: true } },
      },
    });
    if (!segment) throw new NotFoundException(`Segment ${segmentId} not found`);

    const isV2 = detectDefinitionFormat(segment.definition) === "v2";
    const contactIds = isV2
      ? Array.from(
          await this.resolveV2MemberIds(
            segment.tenantId,
            segment.definition,
            segment.audience?.channel,
          ),
        )
      : Array.from(await this.legacy.resolveMemberIds(segment.tenantId, segment.definition));

    await this.prisma.$transaction(async (tx) => {
      await tx.audienceSegmentMember.deleteMany({ where: { segmentId } });
      if (contactIds.length > 0) {
        await tx.audienceSegmentMember.createMany({
          data: contactIds.map((contactId) => ({ segmentId, contactId })),
          skipDuplicates: true,
        });
      }
      // v2 segments stamp evaluation freshness (blasts re-evaluate when stale).
      if (isV2) {
        await tx.audienceSegment.update({
          where: { id: segmentId },
          data: { lastEvaluatedAt: new Date() },
        });
      }
      // Durable domain event, atomic with the membership rewrite (meld doc 05) —
      // lets journeys/analytics react to a resolved segment. Emitted even at count 0
      // (an emptied segment is still a recompute worth publishing).
      await this.outbox.append(tx, {
        tenantId: segment.tenantId,
        eventType: "audience.segment.recomputed",
        aggregateId: segmentId,
        payload: {
          segmentId,
          tenantId: segment.tenantId,
          memberCount: contactIds.length,
        },
      });
    });

    this.logger.debug("audience", "segment evaluated", { segmentId, count: contactIds.length });
    return { count: contactIds.length };
  }

  /** Worker entrypoint for the `segment-eval` queue. */
  async processEvalJob(data: { segmentId: string }): Promise<{ count: number }> {
    return this.evaluate(data.segmentId);
  }

  // ── v2 (engine) resolution ────────────────────────────────────────────
  private async resolveV2MemberIds(
    tenantId: string,
    definition: unknown,
    audienceChannel?: string | null,
  ): Promise<Set<string>> {
    if (!this.leafResolver) {
      throw new Error("SegmentLeafResolverService unavailable — cannot evaluate a v2 segment");
    }
    // Fail-loud: a stored v2 envelope that no longer parses is a bug to surface,
    // not an audience to silently empty (the eval job will retry + alert).
    const envelope: SegmentDefinitionV2 = SegmentDefinitionV2Schema.parse(definition);

    const channel: ComplianceChannel = audienceChannel === "WHATSAPP" ? "WHATSAPP" : "SMS";
    const composed = composeEffectiveTree(
      { filter: envelope.filter, policy: envelope.policy },
      "blast",
      { channel },
    );
    const universe = await this.leafResolver.universe(tenantId);
    const { resolved } = await this.leafResolver.resolveLeaves(
      tenantId,
      collectEffectiveLeaves(composed.tree),
      universe,
      { customClauses: envelope.customClauses },
    );
    return foldEffectiveTree(composed.tree, (leaf) => resolved.get(leaf) ?? new Set(), universe);
  }
}

import { createHash } from "node:crypto";
import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { ApiHttpException } from "../common/http/api-response";
import { HeatFactorsService } from "./heat-factors.service";
import type { HeatConfig } from "./heat.service";
import {
  DEFAULT_ICC,
  type EvaluationAssignment,
  type EvaluationCluster,
  type PowerEstimate,
  assignClusters,
  clusterPower,
} from "./evaluation";

/** What CanvassCampaign.evaluation stores — the immutable assignment + its power maths. */
export interface StoredEvaluation {
  seed: number;
  icc: number;
  pairs: EvaluationAssignment["pairs"];
  unpaired: string | null;
  treatmentCodes: string[];
  holdoutCodes: string[];
  power: PowerEstimate;
  enabledAt: string;
}

/**
 * Evaluation mode: pair-matched SA1 cluster randomisation for a campaign, so the
 * program's effect can be read against a genuine holdout (the Arceneaux precinct
 * template — the design that works without electoral-roll access). The assignment is
 * immutable once field work exists: switching arms after knocking starts is how
 * selection bias gets laundered back in.
 */
@Injectable()
export class EvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly factors: HeatFactorsService,
  ) {}

  /** The stored assignment (null when evaluation is off). */
  async get(tenantId: string, campaignId: string): Promise<StoredEvaluation | null> {
    const campaign = await this.loadCampaign(tenantId, campaignId);
    return (campaign.evaluation as StoredEvaluation | null) ?? null;
  }

  /** Power preview WITHOUT persisting — the "should we even run this" check. */
  async power(tenantId: string, campaignId: string, icc = DEFAULT_ICC): Promise<PowerEstimate> {
    const campaign = await this.loadCampaign(tenantId, campaignId);
    const clusters = await this.clusters(tenantId, campaign);
    return clusterPower(clusters, { icc });
  }

  /** Enable evaluation: assign arms (deterministic seed) + persist. Refused when unpowered. */
  async enable(tenantId: string, campaignId: string, opts: { icc?: number } = {}): Promise<StoredEvaluation> {
    const campaign = await this.loadCampaign(tenantId, campaignId);
    if (campaign.evaluation) {
      throw new ApiHttpException("EVALUATION_EXISTS", "Evaluation is already enabled — the assignment is immutable", HttpStatus.CONFLICT);
    }
    await this.assertNoFieldWork(campaignId, "enable");

    const icc = opts.icc ?? DEFAULT_ICC;
    const clusters = await this.clusters(tenantId, campaign);
    const power = clusterPower(clusters, { icc });
    if (power.refusal) {
      throw new ApiHttpException("EVALUATION_UNPOWERED", power.refusal, HttpStatus.UNPROCESSABLE_ENTITY);
    }
    // Deterministic seed from the campaign + its boundary — reproducible, no wall clock.
    const seed = parseInt(
      createHash("sha1").update(`${campaignId}:${JSON.stringify(campaign.boundary)}`).digest("hex").slice(0, 8),
      16,
    );
    const assignment = assignClusters(clusters, seed);
    const stored: StoredEvaluation = {
      seed,
      icc,
      pairs: assignment.pairs,
      unpaired: assignment.unpaired,
      treatmentCodes: assignment.treatmentCodes,
      holdoutCodes: assignment.holdoutCodes,
      power,
      enabledAt: new Date().toISOString(),
    };
    await this.prisma.canvassCampaign.update({
      where: { id: campaignId },
      data: { evaluation: stored as unknown as Prisma.InputJsonValue },
    });
    return stored;
  }

  /** Disable — only before any field work references the assignment. */
  async disable(tenantId: string, campaignId: string): Promise<void> {
    await this.loadCampaign(tenantId, campaignId);
    await this.assertNoFieldWork(campaignId, "disable");
    await this.prisma.canvassCampaign.update({
      where: { id: campaignId },
      data: { evaluation: Prisma.DbNull },
    });
  }

  /**
   * Turf guard: a turf that substantially overlaps a holdout SA1 breaks the experiment.
   * Called by turf creation; > 20% of the turf inside holdout SA1s is refused.
   */
  async assertTurfOutsideHoldout(campaignId: string | null | undefined, turfGeometry: unknown): Promise<void> {
    if (!campaignId) return;
    const campaign = await this.prisma.canvassCampaign.findUnique({
      where: { id: campaignId },
      select: { evaluation: true },
    });
    const evaluation = campaign?.evaluation as StoredEvaluation | null;
    if (!evaluation?.holdoutCodes?.length) return;
    const rows = (await this.prisma.$queryRawUnsafe(
      `
WITH t AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326) AS g)
SELECT COALESCE(SUM(ST_Area(ST_Intersection(s.geom, t.g))) / NULLIF(ST_Area((SELECT t2.g FROM t t2)), 0), 0)::float AS share
FROM geo.sa1 s, t
WHERE s.code = ANY($2::text[]) AND s.geom && t.g
`,
      JSON.stringify(turfGeometry),
      evaluation.holdoutCodes,
    )) as Array<{ share: number }>;
    const share = rows[0]?.share ?? 0;
    if (share > 0.2) {
      throw new ApiHttpException(
        "EVALUATION_HOLDOUT",
        `This turf sits ${(share * 100).toFixed(0)}% inside evaluation holdout areas — knocking there breaks the experiment. Cut turf in the treatment areas, or disable evaluation first.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  // ── internals ────────────────────────────────────────────────────────────

  private async loadCampaign(tenantId: string, campaignId: string) {
    const campaign = await this.prisma.canvassCampaign.findFirst({
      where: { id: campaignId, tenantId },
      select: { id: true, boundary: true, heatConfig: true, evaluation: true },
    });
    if (!campaign) throw new ApiHttpException("CAMPAIGN_NOT_FOUND", "Campaign not found", HttpStatus.NOT_FOUND);
    if (!campaign.boundary) {
      throw new ApiHttpException("NO_BOUNDARY", "Set a campaign boundary before configuring evaluation", HttpStatus.UNPROCESSABLE_ENTITY);
    }
    return campaign;
  }

  /** Field work = any walklist (walklists mean doors are being worked). */
  private async assertNoFieldWork(campaignId: string, verb: string): Promise<void> {
    const walkLists = await this.prisma.walkList.count({ where: { campaignId } });
    if (walkLists > 0) {
      throw new ApiHttpException(
        "EVALUATION_LOCKED",
        `Cannot ${verb} evaluation once walklists exist (${walkLists}) — the assignment must precede field work`,
        HttpStatus.CONFLICT,
      );
    }
  }

  /** SA1 clusters from the boundary: doors + prior competitiveness via the factor extraction. */
  private async clusters(
    tenantId: string,
    campaign: { boundary: unknown; heatConfig: unknown },
  ): Promise<EvaluationCluster[]> {
    const config = (campaign.heatConfig ?? {}) as HeatConfig;
    const rows = await this.factors.extract({
      tenantId,
      boundary: campaign.boundary,
      fitIndicator: config.fitLens?.indicator ?? "seifa_irsd_decile",
      communityIndicator: config.communityLens?.indicator ?? "cald_lote_share",
      poll: null, // competitiveness comes from booth metrics; the poll isn't needed for matching
      electionId: config.electionId ?? null,
      alignedPartyCodes: [],
    });
    return rows
      .filter((r) => r.doors > 0)
      .map((r) => ({ code: r.sa1Code, doors: r.doors, competitiveness: r.competitiveness }));
  }
}

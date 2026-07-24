import { createHash } from "node:crypto";
import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { ApiHttpException } from "../common/http/api-response";
import { DispatchQueue } from "../common/queue/dispatch-queue";
import { DISPATCH_QUEUE_TOKEN } from "../common/queue/queue.tokens";
import { QUEUE_JOB_TYPES, QUEUE_NAMES, getHeatRunJobId } from "../common/queue/queue.constants";
import { GeoService, type BoundarySource } from "../geo/geo.service";
import { hashGeometry } from "./turf-estimate.service";
import { HeatFactorsService } from "./heat-factors.service";
import {
  HEAT_PRESETS,
  type HeatCellResult,
  type HeatMeta,
  type HeatPreset,
  resolveWeights,
  scoreCells,
  type HeatWeights,
} from "./heat-score";

/** Above this many SA1s a campaign run moves to the worker instead of blocking the request
 *  (scoring is the cost). Kept low so turning targeting on returns fast: only tiny boundaries
 *  compute inline; everything else scores in the background while the client polls + shows a
 *  "computing" state, rather than hanging on one long synchronous request. */
export const INLINE_SA1_CAP = 300;
/** Preview hard cap — beyond this the selection is too broad to score interactively. */
export const PREVIEW_SA1_CAP = 5_000;
/** Default fit lens: SEIFA disadvantage decile, near-middle target. */
const DEFAULT_FIT_INDICATOR = "seifa_irsd_decile";
/** Default community lens: CALD language-other-than-English share. */
const DEFAULT_COMMUNITY_INDICATOR = "cald_lote_share";

/** Campaign heat configuration (CanvassCampaign.heatConfig). All parts optional. */
export interface HeatConfig {
  preset?: HeatPreset;
  weights?: Partial<HeatWeights>;
  pollRef?: { pollId: string; questionCode: string; responseLabel: string; geoKind?: string } | null;
  alignedPartyCodes?: string[];
  electionId?: string | null;
  fitLens?: { indicator: string; target?: number; span?: number } | null;
  /** The community lens (defaults: CALD share, higher = hotter). */
  communityLens?: { indicator: string; target?: number; span?: number } | null;
}

export interface HeatResponse {
  meta: HeatMeta & {
    campaignId: string | null;
    preset: HeatPreset;
    computedAt: string;
    stale: boolean;
    queued?: boolean;
    election: { id: string; note: string } | null;
    /** Effective lens/poll config (defaults resolved) — the UI pickers hydrate from this. */
    config?: {
      fitLens: { indicator: string; target?: number; span?: number };
      communityLens: { indicator: string; target?: number; span?: number };
      pollRef: { pollId: string; questionCode: string; responseLabel: string; geoKind?: string } | null;
      alignedPartyCodes: string[];
      electionId: string | null;
    };
  };
  cells: HeatCellResult[];
}

/**
 * Targeting heat-map orchestration: per-campaign cached runs invalidated by an
 * inputs hash (TurfEstimate's pattern), inline for small boundaries and queued to
 * the worker above {@link INLINE_SA1_CAP}, plus the uncached boundary-editor
 * preview path. Every formula lives in the pure scorer; every query in the
 * factors service — this file only decides WHEN to compute and WHERE to cache.
 */
@Injectable()
export class HeatService {
  private readonly logger = new Logger(HeatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly factors: HeatFactorsService,
    private readonly geo: GeoService,
    @Inject(DISPATCH_QUEUE_TOKEN) private readonly queue: DispatchQueue,
  ) {}

  /** The campaign heat map — cached when fresh, recomputed (or queued) when stale. */
  async getForCampaign(tenantId: string, campaignId: string): Promise<HeatResponse> {
    const campaign = await this.loadCampaign(tenantId, campaignId);
    if (!campaign.boundary) {
      throw new ApiHttpException("NO_BOUNDARY", "Set a campaign boundary before computing targeting", HttpStatus.UNPROCESSABLE_ENTITY);
    }
    const config = (campaign.heatConfig ?? {}) as HeatConfig;
    const inputsHash = await this.inputsHash(tenantId, campaign.boundary, config);

    const existing = await this.liveRun(campaignId);
    if (existing && existing.inputsHash === inputsHash) {
      return this.assemble(existing, { campaignId, stale: false });
    }

    const sa1Count = await this.factors.countSa1s(campaign.boundary);
    if (sa1Count > INLINE_SA1_CAP) {
      await this.queue.enqueue({
        id: getHeatRunJobId(campaignId),
        queue: QUEUE_NAMES.HEAT_RUN,
        type: QUEUE_JOB_TYPES.HEAT_RUN_COMPUTE,
        payload: { tenantId, campaignId },
        removeOnComplete: true,
      });
      if (existing) return this.assemble(existing, { campaignId, stale: true, queued: true });
      throw new ApiHttpException(
        "HEAT_QUEUED",
        "This boundary is large — the targeting map is being computed in the background",
        HttpStatus.ACCEPTED,
      );
    }

    const run = await this.compute(tenantId, campaignId, campaign.boundary, config, inputsHash);
    return this.assemble(run, { campaignId, stale: false });
  }

  /**
   * Boundary-editor preview: score an ad-hoc union of sources with no campaign and
   * no persistence — the heat renders WHILE the organiser composes the boundary.
   */
  async preview(tenantId: string, sources: BoundarySource[], config: HeatConfig = {}): Promise<HeatResponse> {
    if (!sources.length) {
      throw new ApiHttpException("NO_SOURCES", "Select at least one area to preview targeting", HttpStatus.UNPROCESSABLE_ENTITY);
    }
    const boundary = await this.geo.unionSources(sources);
    if (!boundary) {
      throw new ApiHttpException("NO_BOUNDARY", "The selection produced no usable boundary", HttpStatus.UNPROCESSABLE_ENTITY);
    }
    const sa1Count = await this.factors.countSa1s(boundary);
    if (sa1Count > PREVIEW_SA1_CAP) {
      throw new ApiHttpException(
        "PREVIEW_TOO_LARGE",
        `That selection spans ${sa1Count.toLocaleString()} SA1s — narrow it to preview targeting (cap ${PREVIEW_SA1_CAP.toLocaleString()})`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const { cells, meta, preset, electionId } = await this.score(tenantId, boundary, config);
    return {
      meta: {
        ...meta,
        campaignId: null,
        preset,
        computedAt: new Date().toISOString(),
        stale: false,
        election: electionId ? { id: electionId, note: "election-day booths only" } : null,
        config: this.echoConfig(config),
      },
      cells,
    };
  }

  /** The effective lens/poll config, echoed in meta so the UI pickers hydrate from saved state. */
  private echoConfig(config: HeatConfig) {
    return {
      fitLens: config.fitLens ?? { indicator: DEFAULT_FIT_INDICATOR },
      communityLens: config.communityLens ?? { indicator: DEFAULT_COMMUNITY_INDICATOR },
      pollRef: config.pollRef ?? null,
      alignedPartyCodes: config.alignedPartyCodes ?? [],
      electionId: config.electionId ?? null,
    };
  }

  /** Save the campaign heat config, then recompute (inline or queued) immediately. */
  async setConfig(tenantId: string, campaignId: string, config: HeatConfig): Promise<HeatResponse> {
    await this.loadCampaign(tenantId, campaignId);
    await this.prisma.canvassCampaign.update({
      where: { id: campaignId },
      data: { heatConfig: config as unknown as Prisma.InputJsonValue },
    });
    return this.getForCampaign(tenantId, campaignId);
  }

  /** Force refresh regardless of hash (the "Refresh" button + the nightly sweep). */
  async refresh(tenantId: string, campaignId: string): Promise<HeatResponse> {
    const campaign = await this.loadCampaign(tenantId, campaignId);
    if (!campaign.boundary) {
      throw new ApiHttpException("NO_BOUNDARY", "Set a campaign boundary before computing targeting", HttpStatus.UNPROCESSABLE_ENTITY);
    }
    const config = (campaign.heatConfig ?? {}) as HeatConfig;
    const sa1Count = await this.factors.countSa1s(campaign.boundary);
    if (sa1Count > INLINE_SA1_CAP) {
      await this.queue.enqueue({
        id: getHeatRunJobId(campaignId),
        queue: QUEUE_NAMES.HEAT_RUN,
        type: QUEUE_JOB_TYPES.HEAT_RUN_COMPUTE,
        payload: { tenantId, campaignId },
        removeOnComplete: true,
      });
      const existing = await this.liveRun(campaignId);
      if (existing) return this.assemble(existing, { campaignId, stale: true, queued: true });
      throw new ApiHttpException("HEAT_QUEUED", "Computing in the background", HttpStatus.ACCEPTED);
    }
    const inputsHash = await this.inputsHash(tenantId, campaign.boundary, config);
    const run = await this.compute(tenantId, campaignId, campaign.boundary, config, inputsHash);
    return this.assemble(run, { campaignId, stale: false });
  }

  /** The heat-run worker's entry point (large boundaries + the nightly refresh). */
  async processHeatJob(payload: { tenantId: string; campaignId: string }) {
    const campaign = await this.prisma.canvassCampaign.findFirst({
      where: { id: payload.campaignId, tenantId: payload.tenantId },
      select: { id: true, boundary: true, heatConfig: true },
    });
    if (!campaign?.boundary) {
      this.logger.log(`Campaign ${payload.campaignId} vanished or lost its boundary before heat compute`);
      return null;
    }
    const config = (campaign.heatConfig ?? {}) as HeatConfig;
    const inputsHash = await this.inputsHash(payload.tenantId, campaign.boundary, config);
    return this.compute(payload.tenantId, payload.campaignId, campaign.boundary, config, inputsHash);
  }

  // ── internals ────────────────────────────────────────────────────────────

  /** The campaign's current (non-frozen) run, newest first. */
  private liveRun(campaignId: string) {
    return this.prisma.canvassHeatRun.findFirst({
      where: { campaignId, frozen: false },
      include: { cells: true },
      orderBy: { computedAt: "desc" },
    });
  }

  /**
   * Freeze the current run as a pre-election snapshot: it stops rotating on recompute,
   * so post-election validation is genuinely out-of-sample. The next heat read computes
   * a fresh live run alongside it.
   */
  async snapshot(tenantId: string, campaignId: string) {
    await this.loadCampaign(tenantId, campaignId);
    const run = await this.liveRun(campaignId);
    if (!run) {
      throw new ApiHttpException("NO_RUN", "Compute the targeting map before freezing a snapshot", HttpStatus.UNPROCESSABLE_ENTITY);
    }
    await this.prisma.canvassHeatRun.update({ where: { id: run.id }, data: { frozen: true } });
    return { frozenRunId: run.id, computedAt: run.computedAt.toISOString() };
  }

  /** The current live run's id — stamped onto walklists as score provenance. */
  async currentRunId(campaignId: string): Promise<string | null> {
    const run = await this.prisma.canvassHeatRun.findFirst({
      where: { campaignId, frozen: false },
      select: { id: true },
      orderBy: { computedAt: "desc" },
    });
    return run?.id ?? null;
  }

  private async loadCampaign(tenantId: string, campaignId: string) {
    const campaign = await this.prisma.canvassCampaign.findFirst({
      where: { id: campaignId, tenantId },
      select: { id: true, boundary: true, heatConfig: true },
    });
    if (!campaign) throw new ApiHttpException("CAMPAIGN_NOT_FOUND", "Campaign not found", HttpStatus.NOT_FOUND);
    return campaign;
  }

  /** Resolve config → effective scoring inputs, run extraction + the pure scorer. */
  private async score(tenantId: string, boundary: unknown, config: HeatConfig) {
    const preset: HeatPreset = config.preset && HEAT_PRESETS[config.preset] ? config.preset : "coverage";
    const weights = resolveWeights(preset, config.weights);
    const electionId = config.electionId === undefined ? await this.latestElectionId() : config.electionId;

    let poll: { pollId: string; questionId: string; responseLabel: string; geoKind: string } | null = null;
    if (config.pollRef) {
      const question = await this.prisma.pollQuestion.findFirst({
        where: { pollId: config.pollRef.pollId, code: config.pollRef.questionCode },
        select: { id: true },
      });
      if (question) {
        poll = {
          pollId: config.pollRef.pollId,
          questionId: question.id,
          responseLabel: config.pollRef.responseLabel,
          geoKind: config.pollRef.geoKind ?? "sed_upper",
        };
      }
    }

    const rows = await this.factors.extract({
      tenantId,
      boundary,
      fitIndicator: config.fitLens?.indicator ?? DEFAULT_FIT_INDICATOR,
      communityIndicator: config.communityLens?.indicator ?? DEFAULT_COMMUNITY_INDICATOR,
      poll,
      electionId,
      alignedPartyCodes: config.alignedPartyCodes ?? [],
    });
    const { cells, meta } = scoreCells(rows, {
      weights,
      fitTarget: config.fitLens?.target,
      fitSpan: config.fitLens?.span,
      communityTarget: config.communityLens?.target,
      communitySpan: config.communityLens?.span,
    });
    return { cells, meta, preset, weights, electionId };
  }

  /** Compute + persist a campaign run (delete-and-insert inside one transaction). */
  private async compute(
    tenantId: string,
    campaignId: string,
    boundary: unknown,
    config: HeatConfig,
    inputsHash: string,
  ) {
    const { cells, meta, preset, weights, electionId } = await this.score(tenantId, boundary, config);
    const runMeta = {
      ...meta,
      election: electionId ? { id: electionId, note: "election-day booths only" } : null,
      // Effective config echoed so the panel's pickers hydrate from saved state.
      config: this.echoConfig(config),
    };
    return this.prisma.$transaction(async (tx) => {
      // Frozen runs (pre-election snapshots) survive recompute — only the live run rotates.
      await tx.canvassHeatRun.deleteMany({ where: { campaignId, frozen: false } });
      const run = await tx.canvassHeatRun.create({
        data: {
          campaignId,
          tenantId,
          inputsHash,
          preset,
          weights: weights as unknown as Prisma.InputJsonValue,
          meta: runMeta as unknown as Prisma.InputJsonValue,
        },
      });
      if (cells.length > 0) {
        await tx.canvassHeatCell.createMany({
          data: cells.map((c) => ({
            runId: run.id,
            campaignId,
            sa1Code: c.sa1Code,
            score: c.score,
            band: c.band,
            subScores: c.subScores as Prisma.InputJsonValue,
            flags: c.flags as unknown as Prisma.InputJsonValue,
            coverageFraction: c.coverageFraction,
          })),
        });
      }
      return { ...run, cells: cells.map((c) => ({ ...c })) };
    });
  }

  /** Serialised run (cached DB rows or a fresh compute) → the wire contract. */
  private assemble(
    run: {
      preset: string;
      weights: unknown;
      meta: unknown;
      computedAt: Date;
      cells: Array<Record<string, unknown>>;
    },
    opts: { campaignId: string; stale: boolean; queued?: boolean },
  ): HeatResponse {
    const meta = run.meta as HeatMeta & { election?: { id: string; note: string } | null };
    return {
      meta: {
        ...meta,
        weights: run.weights as HeatWeights,
        campaignId: opts.campaignId,
        preset: run.preset as HeatPreset,
        computedAt: run.computedAt.toISOString(),
        stale: opts.stale,
        ...(opts.queued ? { queued: true } : {}),
        election: meta.election ?? null,
      },
      cells: run.cells.map((c) => ({
        sa1Code: String(c.sa1Code),
        score: c.score == null ? null : Number(c.score),
        band: c.band == null ? null : Number(c.band),
        subScores: (c.subScores ?? {}) as HeatCellResult["subScores"],
        flags: (c.flags ?? []) as string[],
        available: (c.available ?? Object.keys((c.subScores ?? {}) as object)) as HeatCellResult["available"],
        coverageFraction: Number(c.coverageFraction ?? 1),
      })),
    };
  }

  /**
   * Everything that changes the answer, hashed: boundary geometry, effective config,
   * reference-data vintage (dataset_meta watermark) and the DAY-truncated tenant
   * knock/disposition watermark — so the nightly refresh picks up the day's knocks
   * without every single knock thrashing the cache.
   */
  private async inputsHash(tenantId: string, boundary: unknown, config: HeatConfig): Promise<string> {
    const [refData, watermark] = await Promise.all([this.refDataVersion(), this.tenantWatermark(tenantId)]);
    return createHash("sha1")
      .update(
        JSON.stringify({
          boundary: hashGeometry(boundary),
          preset: config.preset ?? "coverage",
          weights: config.weights ?? null,
          pollRef: config.pollRef ?? null,
          alignedPartyCodes: config.alignedPartyCodes ?? [],
          electionId: config.electionId ?? "latest",
          fitLens: config.fitLens ?? null,
          communityLens: config.communityLens ?? null,
          refData,
          watermark,
        }),
      )
      .digest("hex");
  }

  private async refDataVersion(): Promise<string> {
    // Any reference-data ingest (ABS, AEC, G-NAF, attribution backfills) rotates the hash —
    // a recompute against unchanged data is cheap; a stale map against new data is not.
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT COALESCE(MAX(last_ingested)::text, 'none') AS v FROM geo.dataset_meta`,
    )) as Array<{ v: string }>;
    return rows[0]?.v ?? "none";
  }

  private async tenantWatermark(tenantId: string): Promise<string> {
    const [knock, disposition] = await Promise.all([
      this.prisma.doorKnock.findFirst({ where: { tenantId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      this.prisma.disposition.findFirst({ where: { tenantId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    ]);
    const latest = Math.max(knock?.createdAt.getTime() ?? 0, disposition?.createdAt.getTime() ?? 0);
    return latest ? new Date(latest).toISOString().slice(0, 10) : "none";
  }

  private async latestElectionId(): Promise<string | null> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id FROM geo.election ORDER BY held_on DESC NULLS LAST LIMIT 1`,
    )) as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  }
}

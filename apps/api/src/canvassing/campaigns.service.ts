import { Injectable } from "@nestjs/common";
import { HttpStatus } from "@nestjs/common";
import {
  CanvassCampaignStatus,
  EngagementChannel,
  Prisma,
  TurfAssignmentStatus,
  WalkListItemStatus,
} from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { ApiHttpException } from "../common/http/api-response";
import { GeoService, type BoundarySource } from "../geo/geo.service";

// Disposition codes where the volunteer reached a human (see engagement-defaults).
const CONTACT_CODES = ["spoke_to_target", "spoke_to_other"];

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export type CreateCampaignInput = {
  name: string;
  status?: CanvassCampaignStatus;
  channel?: EngagementChannel;
  surveyId?: string | null;
  scriptId?: string | null;
  goals?: Record<string, unknown> | null;
  openJoinEnabled?: boolean;
  volunteerCanSelfClaimTurf?: boolean;
  selfClaimModes?: string[] | null;
};

export type UpdateCampaignInput = Partial<CreateCampaignInput>;

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
  ) {}

  async list(tenantId: string) {
    const campaigns = await this.prisma.canvassCampaign.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { turfs: true, walkLists: true } } },
    });
    return campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      channel: c.channel,
      surveyId: c.surveyId,
      scriptId: c.scriptId,
      goals: c.goals,
      openJoinEnabled: c.openJoinEnabled,
      volunteerCanSelfClaimTurf: c.volunteerCanSelfClaimTurf,
      selfClaimModes: c.selfClaimModes,
      hasBoundary: c.boundary != null,
      turfCount: c._count.turfs,
      walkListCount: c._count.walkLists,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  async get(tenantId: string, id: string) {
    const campaign = await this.prisma.canvassCampaign.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { turfs: true, walkLists: true } } },
    });
    if (!campaign) {
      throw new ApiHttpException("CAMPAIGN_NOT_FOUND", "Campaign not found", HttpStatus.NOT_FOUND);
    }
    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      channel: campaign.channel,
      surveyId: campaign.surveyId,
      scriptId: campaign.scriptId,
      goals: campaign.goals,
      openJoinEnabled: campaign.openJoinEnabled,
      volunteerCanSelfClaimTurf: campaign.volunteerCanSelfClaimTurf,
      selfClaimModes: campaign.selfClaimModes,
      hasBoundary: campaign.boundary != null,
      turfCount: campaign._count.turfs,
      walkListCount: campaign._count.walkLists,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    };
  }

  /** Headline KPIs for the overview: doors today, turf %, contact rate, volunteers out. */
  async getSummary(tenantId: string, id: string) {
    const campaign = await this.prisma.canvassCampaign.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!campaign) {
      throw new ApiHttpException("CAMPAIGN_NOT_FOUND", "Campaign not found", HttpStatus.NOT_FOUND);
    }

    const turfs = await this.prisma.turf.findMany({
      where: { tenantId, campaignId: id },
      select: { id: true },
    });
    const turfIds = turfs.map((t) => t.id);
    const contactInCampaign: Prisma.DoorKnockWhereInput =
      turfIds.length > 0
        ? { tenantId, contact: { turfId: { in: turfIds } } }
        : { tenantId, id: "__none__" }; // no turfs → no knocks

    const [doorsToday, totalKnocks, contactKnocks, totalStops, visitedStops, locks] =
      await Promise.all([
        this.prisma.doorKnock.count({
          where: { ...contactInCampaign, createdAt: { gte: startOfToday() } },
        }),
        this.prisma.doorKnock.count({ where: contactInCampaign }),
        this.prisma.doorKnock.count({
          where: { ...contactInCampaign, dispositionCode: { in: CONTACT_CODES } },
        }),
        this.prisma.walkListItem.count({ where: { walkList: { campaignId: id } } }),
        this.prisma.walkListItem.count({
          where: { walkList: { campaignId: id }, status: WalkListItemStatus.VISITED },
        }),
        turfIds.length > 0
          ? this.prisma.turfAssignment.findMany({
              where: { turfId: { in: turfIds }, status: TurfAssignmentStatus.ASSIGNED },
              select: { volunteerId: true },
            })
          : Promise.resolve([]),
      ]);

    const volunteersOut = new Set(locks.map((l) => l.volunteerId)).size;
    return {
      doorsToday,
      turfCompletePct: totalStops > 0 ? Math.round((visitedStops / totalStops) * 100) : 0,
      contactRate: totalKnocks > 0 ? Math.round((contactKnocks / totalKnocks) * 100) : 0,
      volunteersOut,
      knockedStops: visitedStops,
      totalStops,
    };
  }

  /** Helper: the turf ids in a campaign, throwing if the campaign is unknown. */
  private async campaignTurfIds(tenantId: string, id: string): Promise<string[]> {
    const campaign = await this.prisma.canvassCampaign.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!campaign) {
      throw new ApiHttpException("CAMPAIGN_NOT_FOUND", "Campaign not found", HttpStatus.NOT_FOUND);
    }
    const turfs = await this.prisma.turf.findMany({
      where: { tenantId, campaignId: id },
      select: { id: true },
    });
    return turfs.map((t) => t.id);
  }

  /** Disposition breakdown, support-level distribution and the door+text funnel. */
  async getResults(tenantId: string, id: string) {
    const turfIds = await this.campaignTurfIds(tenantId, id);
    const contactFilter =
      turfIds.length > 0 ? { contact: { turfId: { in: turfIds } } } : { id: "__none__" };

    const [byCode, bySupport, doorsAttempted, contacted, surveyed, newSupporters] =
      await Promise.all([
        this.prisma.disposition.groupBy({
          by: ["code"],
          where: { tenantId, ...contactFilter },
          _count: { _all: true },
        }),
        this.prisma.disposition.groupBy({
          by: ["supportLevel"],
          where: { tenantId, supportLevel: { not: null }, ...contactFilter },
          _count: { _all: true },
        }),
        this.prisma.doorKnock.count({ where: { tenantId, ...contactFilter } }),
        this.prisma.doorKnock.count({
          where: { tenantId, dispositionCode: { in: CONTACT_CODES }, ...contactFilter },
        }),
        this.prisma.questionResponse.count({ where: { tenantId, ...contactFilter } }),
        this.prisma.disposition.count({
          where: {
            tenantId,
            supportLevel: { in: ["STRONG_SUPPORT", "LEAN_SUPPORT"] },
            ...contactFilter,
          },
        }),
      ]);

    return {
      dispositionBreakdown: byCode.map((r) => ({ code: r.code, count: r._count._all })),
      supportDistribution: bySupport.map((r) => ({
        supportLevel: r.supportLevel,
        count: r._count._all,
      })),
      funnel: { doorsAttempted, contacted, surveyed, newSupporters },
    };
  }

  /** Live war-room snapshot: who's out, recent knocks, simple alerts. */
  async getLive(tenantId: string, id: string) {
    const turfIds = await this.campaignTurfIds(tenantId, id);
    if (turfIds.length === 0) {
      return { volunteers: [], recentKnocks: [], doorsToday: 0 };
    }
    const contactFilter = { contact: { turfId: { in: turfIds } } };

    const [locks, knocksToday, recent] = await Promise.all([
      this.prisma.turfAssignment.findMany({
        where: { turfId: { in: turfIds }, status: TurfAssignmentStatus.ASSIGNED },
        include: {
          volunteer: { select: { id: true, displayName: true } },
          turf: { select: { id: true, name: true } },
        },
      }),
      this.prisma.doorKnock.findMany({
        where: { tenantId, createdAt: { gte: startOfToday() }, ...contactFilter },
        select: { volunteerId: true, createdAt: true },
      }),
      this.prisma.doorKnock.findMany({
        where: { tenantId, ...contactFilter },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { volunteer: { select: { id: true, displayName: true } } },
      }),
    ]);

    const doorsByVolunteer = new Map<string, { count: number; last: Date }>();
    for (const k of knocksToday) {
      if (!k.volunteerId) continue;
      const cur = doorsByVolunteer.get(k.volunteerId);
      if (!cur) doorsByVolunteer.set(k.volunteerId, { count: 1, last: k.createdAt });
      else {
        cur.count += 1;
        if (k.createdAt > cur.last) cur.last = k.createdAt;
      }
    }

    const volunteers = locks.map((l) => {
      const stat = doorsByVolunteer.get(l.volunteerId);
      const idleMs = stat ? Date.now() - stat.last.getTime() : Infinity;
      return {
        volunteerId: l.volunteerId,
        name: l.volunteer.displayName,
        turf: l.turf.name,
        doorsToday: stat?.count ?? 0,
        lastActionAt: stat?.last ?? null,
        idle: idleMs > 30 * 60 * 1000, // no knock in 30 min
      };
    });

    return {
      volunteers,
      doorsToday: knocksToday.length,
      recentKnocks: recent.map((k) => ({
        id: k.id,
        at: k.createdAt,
        dispositionCode: k.dispositionCode,
        volunteer: k.volunteer?.displayName ?? null,
      })),
    };
  }

  async create(tenantId: string, input: CreateCampaignInput) {
    return this.prisma.canvassCampaign.create({
      data: {
        tenantId,
        name: input.name,
        status: input.status ?? CanvassCampaignStatus.DRAFT,
        channel: input.channel ?? EngagementChannel.BOTH,
        surveyId: input.surveyId ?? null,
        scriptId: input.scriptId ?? null,
        goals: (input.goals ?? Prisma.DbNull) as Prisma.InputJsonValue,
        openJoinEnabled: input.openJoinEnabled ?? false,
        volunteerCanSelfClaimTurf: input.volunteerCanSelfClaimTurf ?? false,
        selfClaimModes: (input.selfClaimModes ?? Prisma.DbNull) as Prisma.InputJsonValue,
      },
    });
  }

  async update(tenantId: string, id: string, input: UpdateCampaignInput) {
    const existing = await this.prisma.canvassCampaign.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new ApiHttpException("CAMPAIGN_NOT_FOUND", "Campaign not found", HttpStatus.NOT_FOUND);
    }
    const data: Prisma.CanvassCampaignUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.status !== undefined) data.status = input.status;
    if (input.channel !== undefined) data.channel = input.channel;
    if (input.surveyId !== undefined) data.surveyId = input.surveyId;
    if (input.scriptId !== undefined) data.scriptId = input.scriptId;
    if (input.goals !== undefined) {
      data.goals = (input.goals ?? Prisma.DbNull) as Prisma.InputJsonValue;
    }
    if (input.openJoinEnabled !== undefined) data.openJoinEnabled = input.openJoinEnabled;
    if (input.volunteerCanSelfClaimTurf !== undefined) {
      data.volunteerCanSelfClaimTurf = input.volunteerCanSelfClaimTurf;
    }
    if (input.selfClaimModes !== undefined) {
      data.selfClaimModes = (input.selfClaimModes ?? Prisma.DbNull) as Prisma.InputJsonValue;
    }
    return this.prisma.canvassCampaign.update({ where: { id }, data });
  }

  /** Campaign boundary (cached GeoJSON) + its re-editable source list. */
  async getBoundary(tenantId: string, id: string) {
    const c = await this.prisma.canvassCampaign.findFirst({
      where: { id, tenantId },
      select: { boundary: true, boundarySources: true },
    });
    if (!c) throw new ApiHttpException("CAMPAIGN_NOT_FOUND", "Campaign not found", HttpStatus.NOT_FOUND);
    return { boundary: c.boundary, sources: c.boundarySources };
  }

  /** Rebuild the campaign boundary from a union of sources (divisions/areas/polygons) + cache it. */
  async setBoundary(tenantId: string, id: string, sources: BoundarySource[]) {
    const c = await this.prisma.canvassCampaign.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!c) throw new ApiHttpException("CAMPAIGN_NOT_FOUND", "Campaign not found", HttpStatus.NOT_FOUND);
    const boundary = sources.length ? await this.geo.unionSources(sources) : null;
    await this.prisma.canvassCampaign.update({
      where: { id },
      data: {
        boundary: (boundary ?? Prisma.DbNull) as Prisma.InputJsonValue,
        boundarySources: (sources.length ? (sources as unknown) : Prisma.DbNull) as Prisma.InputJsonValue,
      },
    });
    return { boundary, sources };
  }
}

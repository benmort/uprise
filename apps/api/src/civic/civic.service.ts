import { Injectable } from "@nestjs/common";
import { Chamber, House, Prisma } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { ApiHttpException } from "../common/http/api-response";

const POLITICIAN_DETAIL_INCLUDE = {
  positions: {
    orderBy: { agreement: "desc" },
    include: { policy: { select: { id: true, tvfyId: true, name: true, provisional: true } } },
  },
} satisfies Prisma.PoliticianInclude;

const POLICY_DETAIL_INCLUDE = {
  positions: {
    include: {
      politician: {
        select: { id: true, tvfyId: true, name: true, party: true, house: true, electorate: true },
      },
    },
  },
} satisfies Prisma.PolicyInclude;

type PoliticianDetailRow = Prisma.PoliticianGetPayload<{ include: typeof POLITICIAN_DETAIL_INCLUDE }>;
type PolicyDetailRow = Prisma.PolicyGetPayload<{ include: typeof POLICY_DETAIL_INCLUDE }>;
type PoliticianRow = Prisma.PoliticianGetPayload<Record<string, never>>;

const num = (d: Prisma.Decimal | null): number | null => (d == null ? null : Number(d));

/**
 * Read API for the `civic` domain (politicians + policies synced from They Vote For You).
 * Global reference data — no tenant scoping; every route is permission-gated at the controller.
 */
@Injectable()
export class CivicService {
  constructor(private readonly prisma: PrismaService) {}

  async listPoliticians(filters: {
    jurisdiction?: string;
    chamber?: string;
    house?: string;
    party?: string;
    geoKind?: string;
    geoCode?: string;
    q?: string;
  }) {
    const where: Prisma.PoliticianWhereInput = {};
    if (filters.jurisdiction) where.jurisdiction = filters.jurisdiction.toUpperCase();
    if (filters.chamber === "LOWER" || filters.chamber === "UPPER") where.chamber = filters.chamber as Chamber;
    if (filters.house === "REPS" || filters.house === "SENATE") where.house = filters.house as House;
    if (filters.party) where.party = { equals: filters.party, mode: "insensitive" };
    if (filters.geoKind) where.geoKind = filters.geoKind;
    if (filters.geoCode) where.geoCode = filters.geoCode;
    if (filters.q) where.name = { contains: filters.q, mode: "insensitive" };
    const rows = await this.prisma.politician.findMany({ where, orderBy: { name: "asc" } });
    return rows.map((p) => this.mapPoliticianSummary(p));
  }

  async getPolitician(id: string) {
    const p = await this.prisma.politician.findUnique({ where: { id }, include: POLITICIAN_DETAIL_INCLUDE });
    if (!p) throw new ApiHttpException("POLITICIAN_NOT_FOUND", "Politician not found");
    return {
      ...this.mapPoliticianSummary(p),
      offices: p.offices ?? null,
      lastSyncedAt: p.lastSyncedAt,
      positions: p.positions.map((pos) => ({
        policyId: pos.policy.id,
        policyTvfyId: pos.policy.tvfyId,
        policyName: pos.policy.name,
        provisional: pos.policy.provisional,
        agreement: num(pos.agreement),
        voted: pos.voted,
        category: pos.category,
      })),
    };
  }

  async listPolicies(filters: { q?: string; provisional?: boolean }) {
    const where: Prisma.PolicyWhereInput = {};
    if (filters.q) where.name = { contains: filters.q, mode: "insensitive" };
    if (filters.provisional !== undefined) where.provisional = filters.provisional;
    const rows = await this.prisma.policy.findMany({ where, orderBy: { name: "asc" } });
    return rows.map((p) => ({
      id: p.id,
      tvfyId: p.tvfyId,
      name: p.name,
      description: p.description,
      provisional: p.provisional,
      lastEditedAt: p.lastEditedAt,
    }));
  }

  async getPolicy(id: string) {
    const p = await this.prisma.policy.findUnique({ where: { id }, include: POLICY_DETAIL_INCLUDE });
    if (!p) throw new ApiHttpException("POLICY_NOT_FOUND", "Policy not found");
    return this.mapPolicyDetail(p);
  }

  private mapPoliticianSummary(p: PoliticianRow) {
    return {
      id: p.id,
      tvfyId: p.tvfyId,
      wikidataId: p.wikidataId,
      name: p.name,
      firstName: p.firstName,
      lastName: p.lastName,
      party: p.party,
      jurisdiction: p.jurisdiction,
      chamber: p.chamber,
      house: p.house,
      electorate: p.electorate,
      geoKind: p.geoKind,
      geoCode: p.geoCode,
      rebellions: p.rebellions,
      votesAttended: p.votesAttended,
      votesPossible: p.votesPossible,
    };
  }

  private mapPolicyDetail(p: PolicyDetailRow) {
    return {
      id: p.id,
      tvfyId: p.tvfyId,
      name: p.name,
      description: p.description,
      provisional: p.provisional,
      lastEditedAt: p.lastEditedAt,
      positions: p.positions.map((pos) => ({
        politicianId: pos.politician.id,
        politicianTvfyId: pos.politician.tvfyId,
        politicianName: pos.politician.name,
        party: pos.politician.party,
        house: pos.politician.house,
        electorate: pos.politician.electorate,
        agreement: num(pos.agreement),
        voted: pos.voted,
        category: pos.category,
      })),
    };
  }
}

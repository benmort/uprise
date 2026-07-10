import { Injectable, Logger } from "@nestjs/common";
import { House, Prisma } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import {
  TheyVoteForYouClient,
  type TvfyPerson,
  type TvfyPolicyRef,
} from "./theyvoteforyou.client";

export type CivicSyncSummary = {
  politicians: number;
  policies: number;
  positions: number;
  /** Politicians whose electorate didn't resolve to a geo code. */
  unmatched: number;
};

export type PoliticianFields = {
  name: string;
  firstName: string | null;
  lastName: string | null;
  party: string | null;
  house: House;
  electorate: string | null;
  geoKind: string | null;
  geoCode: string | null;
};

/** TVFY `house` string → our House enum; null for anything unrecognised. */
export function parseHouse(house?: string | null): House | null {
  const h = (house ?? "").trim().toLowerCase();
  if (h === "representatives") return House.REPS;
  if (h === "senate") return House.SENATE;
  return null;
}

/** TVFY senate electorates come as a mix of abbreviations and full state names. */
const SENATE_STATE_CODES: Record<string, string> = {
  act: "ACT",
  "australian capital territory": "ACT",
  nsw: "NSW",
  "new south wales": "NSW",
  nt: "NT",
  "northern territory": "NT",
  qld: "QLD",
  queensland: "QLD",
  sa: "SA",
  "south australia": "SA",
  tas: "TAS",
  tasmania: "TAS",
  vic: "VIC",
  victoria: "VIC",
  wa: "WA",
  "western australia": "WA",
};

/** A senator's state → the `geo.chamber_electorate` code (`SENATE-<STATE>`); null if unknown. */
export function resolveSenateCode(electorate?: string | null): string | null {
  if (!electorate) return null;
  const code = SENATE_STATE_CODES[electorate.trim().toLowerCase()];
  return code ? `SENATE-${code}` : null;
}

/** TVFY agreement scores arrive as strings ("100"); coerce to a number, else null. */
export function parseAgreement(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Map a TVFY person to Politician columns, resolving its electorate to an id-only geo reference:
 * House of Reps → `("ced", <geo.ced code>)` via `resolveCed`; Senate → `("chamber_electorate",
 * "SENATE-<STATE>")`. `geoCode` is null when the electorate name doesn't resolve. Returns null
 * when the person has no usable current membership (no recognised house). Pure — no DB.
 */
export function buildPoliticianFields(
  person: TvfyPerson,
  resolveCed: (name: string) => string | null,
): PoliticianFields | null {
  const member = person.latest_member;
  if (!member) return null;
  const house = parseHouse(member.house);
  if (!house) return null;

  const first = member.name?.first?.trim() || null;
  const last = member.name?.last?.trim() || null;
  const name = [first, last].filter(Boolean).join(" ") || `Person ${person.id}`;
  const electorate = member.electorate?.trim() || null;

  let geoKind: string | null = null;
  let geoCode: string | null = null;
  if (house === House.REPS) {
    geoKind = "ced";
    geoCode = electorate ? resolveCed(electorate) : null;
  } else {
    geoKind = "chamber_electorate";
    geoCode = resolveSenateCode(electorate);
  }

  return {
    name,
    firstName: first,
    lastName: last,
    party: member.party?.trim() || null,
    house,
    electorate,
    geoKind,
    geoCode,
  };
}

/**
 * Ingest They Vote For You reference data into the `civic` schema. Idempotent: politicians and
 * policies upsert on their TVFY id, positions on `(politician, policy)`, so re-running refreshes
 * in place. Global reference data — no tenant, no outbox event (nothing reacts). Each run is
 * recorded in `CivicSyncRun` with counts + status for observability.
 *
 * Run via the `civic:sync` script; later promotable to a cron-dispatched BullMQ job.
 */
@Injectable()
export class CivicSyncService {
  private readonly logger = new Logger(CivicSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tvfy: TheyVoteForYouClient,
  ) {}

  async run(): Promise<CivicSyncSummary> {
    const runRow = await this.prisma.civicSyncRun.create({ data: {} });
    try {
      const resolveCed = await this.buildCedResolver();

      // 1. People → politicians.
      const people = await this.tvfy.listPeople();
      let unmatched = 0;
      const politicianIdByTvfy = new Map<number, string>();
      for (const person of people) {
        const fields = buildPoliticianFields(person, resolveCed);
        if (!fields) continue;
        if (fields.geoCode == null) unmatched += 1;
        const row = await this.prisma.politician.upsert({
          where: { tvfyId: person.id },
          update: { ...fields, lastSyncedAt: new Date() },
          create: { tvfyId: person.id, ...fields, lastSyncedAt: new Date() },
        });
        politicianIdByTvfy.set(person.id, row.id);
      }
      this.logger.log(`Upserted ${politicianIdByTvfy.size} politicians (${unmatched} without a geo match).`);

      // 2. Policies → the canonical policy list.
      const policies = await this.tvfy.listPolicies();
      const policyIdByTvfy = new Map<number, string>();
      for (const policy of policies) {
        const row = await this.upsertPolicy(policy);
        policyIdByTvfy.set(policy.id, row.id);
      }

      // 3. Per-person detail → stats + policy positions (agreement / voted).
      let positions = 0;
      for (const [tvfyPersonId, politicianId] of politicianIdByTvfy) {
        const detail = await this.tvfy.getPerson(tvfyPersonId);
        if (!detail) continue;
        await this.prisma.politician.update({
          where: { id: politicianId },
          data: {
            rebellions: detail.rebellions ?? null,
            votesAttended: detail.votes_attended ?? null,
            votesPossible: detail.votes_possible ?? null,
            offices: (detail.offices ?? []) as unknown as Prisma.InputJsonValue,
          },
        });
        for (const cmp of detail.policy_comparisons ?? []) {
          let policyId = policyIdByTvfy.get(cmp.policy.id);
          if (!policyId) {
            const row = await this.upsertPolicy(cmp.policy);
            policyId = row.id;
            policyIdByTvfy.set(cmp.policy.id, row.id);
          }
          const data = { agreement: parseAgreement(cmp.agreement), voted: Boolean(cmp.voted) };
          await this.prisma.policyPosition.upsert({
            where: { politicianId_policyId: { politicianId, policyId } },
            update: data,
            create: { politicianId, policyId, ...data },
          });
          positions += 1;
        }
      }

      const summary: CivicSyncSummary = {
        politicians: politicianIdByTvfy.size,
        policies: policyIdByTvfy.size,
        positions,
        unmatched,
      };
      await this.prisma.civicSyncRun.update({
        where: { id: runRow.id },
        data: { ...summary, status: "succeeded", completedAt: new Date() },
      });
      this.logger.log(
        `Civic sync complete: ${summary.politicians} politicians, ${summary.policies} policies, ${summary.positions} positions.`,
      );
      return summary;
    } catch (error) {
      await this.prisma.civicSyncRun.update({
        where: { id: runRow.id },
        data: { status: "failed", completedAt: new Date(), error: String(error).slice(0, 2000) },
      });
      throw error;
    }
  }

  private upsertPolicy(policy: TvfyPolicyRef) {
    const data = {
      name: policy.name ?? "",
      description: policy.description ?? null,
      provisional: policy.provisional ?? false,
      lastEditedAt: policy.last_edited_at ? new Date(policy.last_edited_at) : null,
      lastSyncedAt: new Date(),
    };
    return this.prisma.policy.upsert({
      where: { tvfyId: policy.id },
      update: data,
      create: { tvfyId: policy.id, ...data },
    });
  }

  /** Build the electorate-name → `geo.ced` code resolver (federal House divisions), normalised. */
  private async buildCedResolver(): Promise<(name: string) => string | null> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT code, name FROM geo.ced`,
    )) as Array<{ code: string; name: string | null }>;
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    const byName = new Map(rows.filter((r) => r.name).map((r) => [norm(r.name as string), r.code]));
    return (name: string) => byName.get(norm(name)) ?? null;
  }
}

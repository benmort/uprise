import { Injectable } from "@nestjs/common";
import type { DialerCampaign, Politician } from "@uprise/db";
import { Prisma } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { isValidAuTargetNumber } from "./autodialer.service";

/**
 * Electoral targeting rebuilt on uprise's own civic data (locked decision — the
 * source's external ELECTORAL_POSTCODE_LOOKUP_API is dropped).
 *
 * postcode → electorate(s) reads the materialised `geo.postcode_region` table
 * (G-NAF × address_region, built by the geo_postcode_region migration and the
 * geo:map pipeline); electorate → member reads `civic.Politician` by
 * (geoKind, geoCode) + jurisdiction, with the campaign's optional party filter.
 * Kinds map: 'ced' → geoKind "ced" (federal division), 'sed' → "sed_lower"
 * (state lower house — address_region carries no upper-house layer, so state
 * 'upper' targeting resolves to nothing and degrades gracefully). Federal
 * officeTarget "upper" routes to senators via the postcode's STATE
 * (geoKind "chamber_electorate", geoCode "SENATE-<STATE>").
 */

export type ElectorateOption = {
  code: string;
  name: string;
  /** Share of the postcode's addresses — the menu orders by it, "unsure" takes the first. */
  addressCount: number;
};

export type ElectoralTarget = {
  number: string;
  name: string;
  party: string | null;
  electorate: string | null;
};

const AU_POSTCODE_RE = /^\d{4}$/;

/**
 * Postcode → state/territory, by the published Australia Post ranges (the
 * source's AU region prefix map, ported). Border anomalies (e.g. 2620 spanning
 * NSW/ACT) resolve to the range owner — good enough for Senate routing, where
 * a whole state's senators answer anyway.
 */
export function stateFromPostcode(postcode: string): string | null {
  if (!AU_POSTCODE_RE.test(postcode)) return null;
  const n = Number(postcode);
  if ((n >= 200 && n <= 299) || (n >= 2600 && n <= 2618) || (n >= 2900 && n <= 2920)) return "ACT";
  if ((n >= 1000 && n <= 2599) || (n >= 2619 && n <= 2899) || (n >= 2921 && n <= 2999)) return "NSW";
  if ((n >= 3000 && n <= 3999) || (n >= 8000 && n <= 8999)) return "VIC";
  if ((n >= 4000 && n <= 4999) || (n >= 9000 && n <= 9999)) return "QLD";
  if (n >= 5000 && n <= 5999) return "SA";
  if (n >= 6000 && n <= 6999) return "WA";
  if (n >= 7000 && n <= 7999) return "TAS";
  if ((n >= 800 && n <= 999) || (n >= 100 && n <= 199)) return "NT";
  return null;
}

@Injectable()
export class ElectoralLookupService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The electorates a postcode's addresses fall in, dominant first. Joined to
   * Politician so the IVR menu only ever offers districts that actually have a
   * sitting member in the campaign's jurisdiction (drops the wrong-state seds
   * a border postcode maps to, and codes civic hasn't resolved).
   */
  async lookupPostcode(postcode: string, jurisdiction: string | null): Promise<ElectorateOption[]> {
    if (!AU_POSTCODE_RE.test(postcode)) return [];
    const federal = this.isFederal(jurisdiction);
    const kind = federal ? "ced" : "sed";
    const geoKind = federal ? "ced" : "sed_lower";
    const effectiveJurisdiction = jurisdiction ?? "FEDERAL";
    const rows = await this.prisma.$queryRaw<
      Array<{ code: string; name: string | null; address_count: number }>
    >(Prisma.sql`
      SELECT pr."code", pr."name", pr."address_count"
      FROM "geo"."postcode_region" pr
      WHERE pr."postcode" = ${postcode}
        AND pr."kind" = ${kind}
        AND EXISTS (
          SELECT 1 FROM "civic"."Politician" p
          WHERE p."geoKind" = ${geoKind}
            AND p."geoCode" = pr."code"
            AND p."jurisdiction" = ${effectiveJurisdiction}
        )
      ORDER BY pr."address_count" DESC, pr."code" ASC
    `);
    return rows.map((row) => ({
      code: row.code,
      name: row.name ?? row.code,
      addressCount: Number(row.address_count),
    }));
  }

  /**
   * Resolve the member to dial. Returns null when there is no member with a
   * usable office number — the IVR degrades gracefully (apology + campaign
   * fallback), matching the source's "no number for this postcode" path.
   */
  async resolveTarget(
    campaign: Pick<DialerCampaign, "jurisdiction" | "officeTarget" | "partyTargets">,
    input: { postcode: string; electorate?: ElectorateOption },
  ): Promise<ElectoralTarget | null> {
    const federal = this.isFederal(campaign.jurisdiction);

    if (campaign.officeTarget === "upper") {
      // Federal upper house = the state's senators; state upper houses have no
      // postcode layer in address_region, so they resolve to nothing here.
      if (!federal) return null;
      const state = stateFromPostcode(input.postcode);
      if (!state) return null;
      const senators = await this.prisma.politician.findMany({
        where: { geoKind: "chamber_electorate", geoCode: `SENATE-${state}`, jurisdiction: "FEDERAL" },
        orderBy: { name: "asc" },
      });
      return this.pickTarget(senators, campaign.partyTargets, `SENATE-${state}`);
    }

    if (!input.electorate) return null;
    const members = await this.prisma.politician.findMany({
      where: {
        geoKind: federal ? "ced" : "sed_lower",
        geoCode: input.electorate.code,
        jurisdiction: campaign.jurisdiction ?? "FEDERAL",
      },
      orderBy: { name: "asc" },
    });
    return this.pickTarget(members, campaign.partyTargets, input.electorate.name);
  }

  /* ------------------------------------------------------------ internals */

  private isFederal(jurisdiction: string | null): boolean {
    return !jurisdiction || jurisdiction === "FEDERAL";
  }

  /** Party filter (case-insensitive), then the first member with a dialable number. */
  private pickTarget(
    candidates: Politician[],
    partyTargets: unknown,
    electorateLabel: string | null,
  ): ElectoralTarget | null {
    const parties = Array.isArray(partyTargets)
      ? (partyTargets as unknown[])
          .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
          .map((p) => p.trim().toLowerCase())
      : [];
    const pool =
      parties.length > 0
        ? candidates.filter((c) => c.party && parties.includes(c.party.trim().toLowerCase()))
        : candidates;
    const member = pool.find((c) => c.phone && isValidAuTargetNumber(c.phone));
    if (!member) return null;
    return {
      number: member.phone as string,
      name: member.name,
      party: member.party,
      electorate: member.electorate ?? electorateLabel,
    };
  }
}

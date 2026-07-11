import { Injectable, Logger } from "@nestjs/common";
import { Chamber } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { WikidataClient } from "./wikidata.client";

export type StateChamber = {
  /** VIC | NSW | QLD | SA | WA | TAS | ACT | NT. */
  jurisdiction: string;
  chamber: Chamber;
  /** Wikidata position-held (P39) QID for this chamber. */
  positionQid: string;
  /** geo layer the electorate resolves against. */
  geoKind: "sed_lower" | "sed_upper";
  /** The `state` value in geo.* (full name). */
  stateName: string;
  /** Nominal seat total — logged against the synced count as a coverage signal. */
  seats: number;
};

/**
 * The 10 chambers Wikidata can give a reliable, electorate-anchored current roster for: all 8
 * lower houses + the two upper houses with their own boundaries (VIC & TAS Legislative Councils).
 *
 * NSW/SA/WA Legislative Councils are deliberately ABSENT: they're elected state-wide (no district to
 * anchor "current"), and Wikidata can't separate sitting from former members there (validated — it
 * over/under-counts wildly), so syncing them would surface wrong people. They'd need each parliament's
 * official member list instead. QLD/ACT/NT are unicameral (lower house only).
 *
 * QIDs verified 2026-07 via wbsearchentities; refresh if a chamber's synced count drifts far from `seats`.
 */
export const STATE_CHAMBERS: StateChamber[] = [
  { jurisdiction: "VIC", chamber: Chamber.LOWER, positionQid: "Q18534408", geoKind: "sed_lower", stateName: "Victoria", seats: 88 },
  { jurisdiction: "NSW", chamber: Chamber.LOWER, positionQid: "Q19202748", geoKind: "sed_lower", stateName: "New South Wales", seats: 93 },
  { jurisdiction: "QLD", chamber: Chamber.LOWER, positionQid: "Q18526194", geoKind: "sed_lower", stateName: "Queensland", seats: 93 },
  { jurisdiction: "SA", chamber: Chamber.LOWER, positionQid: "Q18220900", geoKind: "sed_lower", stateName: "South Australia", seats: 47 },
  { jurisdiction: "WA", chamber: Chamber.LOWER, positionQid: "Q20165902", geoKind: "sed_lower", stateName: "Western Australia", seats: 59 },
  { jurisdiction: "TAS", chamber: Chamber.LOWER, positionQid: "Q19007285", geoKind: "sed_lower", stateName: "Tasmania", seats: 35 },
  { jurisdiction: "ACT", chamber: Chamber.LOWER, positionQid: "Q6814365", geoKind: "sed_lower", stateName: "Australian Capital Territory", seats: 25 },
  { jurisdiction: "NT", chamber: Chamber.LOWER, positionQid: "Q26998278", geoKind: "sed_lower", stateName: "Northern Territory", seats: 25 },
  { jurisdiction: "VIC", chamber: Chamber.UPPER, positionQid: "Q19185341", geoKind: "sed_upper", stateName: "Victoria", seats: 40 },
  { jurisdiction: "TAS", chamber: Chamber.UPPER, positionQid: "Q19299542", geoKind: "sed_upper", stateName: "Tasmania", seats: 15 },
];

/** Normalise an electorate name for matching Wikidata labels ↔ geo.* names. */
export function normElectorate(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/^electoral (district|division|region) of\s+/, "")
    .replace(/^(district|division|region) of\s+/, "")
    .replace(/\s+(region|province)$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull the `Q…` id from a Wikidata entity URI. */
export function qidFromUri(uri: string): string | null {
  const m = /\/(Q\d+)$/.exec(uri);
  return m ? m[1] : null;
}

/** SPARQL for current, districted members of a chamber (position + district + alive + not-ended). */
export function membersQuery(positionQid: string): string {
  return `SELECT ?person ?personLabel ?districtLabel ?partyLabel WHERE {
    ?person p:P39 ?ps. ?ps ps:P39 wd:${positionQid}; pq:P768 ?district.
    FILTER NOT EXISTS { ?person wdt:P570 ?dod }
    OPTIONAL { ?ps pq:P582 ?end } FILTER(!BOUND(?end) || ?end > NOW())
    OPTIONAL { ?ps pq:P4100 ?party }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
  }`;
}

export type StateMpSyncSummary = { politicians: number; unmatched: number };

/**
 * Ingest current state MPs from Wikidata into the `civic` schema — a roster (name, party,
 * electorate, chamber) linked id-only to its electorate boundary (`sed_lower`/`sed_upper`). No
 * voting/policy data (none exists for state parliaments). Idempotent: upserts on the Wikidata QID.
 * Coverage is partial (~85–100% per chamber) and logged; a run is recorded in `CivicSyncRun`
 * (`source:"wikidata"`). Run via the `civic:sync-states` script.
 */
@Injectable()
export class StateMpSyncService {
  private readonly logger = new Logger(StateMpSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wikidata: WikidataClient,
  ) {}

  async run(): Promise<StateMpSyncSummary> {
    const runRow = await this.prisma.civicSyncRun.create({ data: { source: "wikidata" } });
    try {
      const resolverCache = new Map<string, Map<string, string>>();
      let politicians = 0;
      let unmatched = 0;

      for (const ch of STATE_CHAMBERS) {
        const resolver = await this.electorateResolver(ch.geoKind, ch.stateName, resolverCache);
        const rows = await this.wikidata.select(membersQuery(ch.positionQid));

        let chamberCount = 0;
        let chamberUnmatched = 0;
        for (const r of rows) {
          const qid = qidFromUri(r.person ?? "");
          if (!qid) continue;
          const electorate = r.districtLabel ?? null;
          const geoCode = electorate ? (resolver.get(normElectorate(electorate)) ?? null) : null;
          if (geoCode == null) chamberUnmatched += 1;
          const fields = {
            name: r.personLabel ?? qid,
            party: r.partyLabel ?? null,
            jurisdiction: ch.jurisdiction,
            chamber: ch.chamber,
            house: null,
            electorate,
            geoKind: ch.geoKind,
            geoCode,
            lastSyncedAt: new Date(),
          };
          await this.prisma.politician.upsert({
            where: { wikidataId: qid },
            update: fields,
            create: { wikidataId: qid, ...fields },
          });
          chamberCount += 1;
        }

        politicians += chamberCount;
        unmatched += chamberUnmatched;
        this.logger.log(
          `${ch.jurisdiction} ${ch.chamber}: ${chamberCount}/${ch.seats} members (${chamberUnmatched} unmatched electorate).`,
        );
      }

      await this.prisma.civicSyncRun.update({
        where: { id: runRow.id },
        data: { politicians, unmatched, status: "succeeded", completedAt: new Date() },
      });
      this.logger.log(
        `State MP sync complete: ${politicians} members across ${STATE_CHAMBERS.length} chambers (${unmatched} unmatched).`,
      );
      return { politicians, unmatched };
    } catch (error) {
      await this.prisma.civicSyncRun.update({
        where: { id: runRow.id },
        data: { status: "failed", completedAt: new Date(), error: String(error).slice(0, 2000) },
      });
      throw error;
    }
  }

  /** Build (cached) the normalised electorate-name → geo code map for a layer + state. */
  private async electorateResolver(
    geoKind: string,
    stateName: string,
    cache: Map<string, Map<string, string>>,
  ): Promise<Map<string, string>> {
    const key = `${geoKind}|${stateName}`;
    const cached = cache.get(key);
    if (cached) return cached;
    // geoKind is a fixed literal from STATE_CHAMBERS (not user input); stateName is parameterised.
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT code, name FROM geo.${geoKind} WHERE state = $1`,
      stateName,
    )) as Array<{ code: string; name: string | null }>;
    const map = new Map<string, string>();
    for (const row of rows) if (row.name) map.set(normElectorate(row.name), row.code);
    cache.set(key, map);
    return map;
  }
}

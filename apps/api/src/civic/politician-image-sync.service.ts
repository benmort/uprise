import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { WikidataClient } from "./wikidata.client";
import { CommonsImageService, commonsFilename } from "./commons-image.service";
import { normElectorate, qidFromUri } from "./state-mp-sync.service";

/**
 * Populate `Politician.imageUrl` from Wikidata P18, re-hosting each free-licensed photo through
 * {@link CommonsImageService}. Kept OUT of the roster syncs: photos change far less often than the
 * roster, and every run writes blobs + hits Wikimedia, so it is its own idempotent step
 * (`civic:images`) that skips a photo whose source filename is unchanged.
 *
 * Two precise joins, never a name guess:
 *   - state MPs already carry their Wikidata QID → P18 directly;
 *   - federal House members join Wikidata by electorate (one sitting member per division).
 * Senators have no clean join (state-wide, twelve per state), so their photos are deferred rather
 * than risk the wrong face on a named senator.
 */

/** "member of the Australian House of Representatives" — one holder per division. */
export const FEDERAL_HOUSE_POSITION = "Q18912794";

/** Query P18 for a batch of people by QID (keep batches small — WQS times out on large queries). */
export function statePeopleImageQuery(qids: string[]): string {
  const values = qids.map((q) => `wd:${q}`).join(" ");
  return `SELECT ?person ?image WHERE {
    VALUES ?person { ${values} }
    ?person wdt:P18 ?image .
  }`;
}

/** Query current House members' electorate + photo, to join our federal House rows by electorate. */
export function federalHouseImageQuery(): string {
  return `SELECT ?districtLabel ?image WHERE {
    ?person p:P39 ?ps . ?ps ps:P39 wd:${FEDERAL_HOUSE_POSITION} ; pq:P768 ?district .
    FILTER NOT EXISTS { ?ps pq:P582 ?end }
    ?person wdt:P18 ?image .
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
  }`;
}

/** Chunk an array into groups of at most `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const STATE_BATCH = 150;

export type ImageSyncSummary = {
  updated: number;
  skipped: number;
  unmatched: number;
  senateDeferred: number;
};

@Injectable()
export class PoliticianImageSyncService {
  private readonly logger = new Logger(PoliticianImageSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wikidata: WikidataClient,
    private readonly commons: CommonsImageService,
  ) {}

  async run(opts: { force?: boolean } = {}): Promise<ImageSyncSummary> {
    if (!this.commons.enabled) {
      throw new Error("Blob storage is not configured (BLOB_READ_WRITE_TOKEN) — cannot mirror photos.");
    }
    const runRow = await this.prisma.civicSyncRun.create({ data: { source: "wikidata-images" } });
    const summary: ImageSyncSummary = { updated: 0, skipped: 0, unmatched: 0, senateDeferred: 0 };
    try {
      await this.syncState(summary, opts.force ?? false);
      await this.syncFederalHouse(summary, opts.force ?? false);

      summary.senateDeferred = await this.prisma.politician.count({
        where: { jurisdiction: "FEDERAL", house: "SENATE" },
      });

      await this.prisma.civicSyncRun.update({
        where: { id: runRow.id },
        data: { politicians: summary.updated, unmatched: summary.unmatched, status: "succeeded", completedAt: new Date() },
      });
      this.logger.log(
        `Image sync complete: ${summary.updated} updated, ${summary.skipped} unchanged, ` +
          `${summary.unmatched} without a free photo, ${summary.senateDeferred} senators deferred.`,
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

  /** State MPs: exact QID → P18. */
  private async syncState(summary: ImageSyncSummary, force: boolean): Promise<void> {
    const mps = await this.prisma.politician.findMany({
      where: { wikidataId: { not: null } },
      select: { id: true, wikidataId: true, imageSourceRef: true },
    });
    const imageByQid = new Map<string, string>();
    for (const batch of chunk(mps.map((m) => m.wikidataId as string), STATE_BATCH)) {
      const rows = await this.wikidata.select(statePeopleImageQuery(batch));
      for (const r of rows) {
        const qid = qidFromUri(r.person ?? "");
        if (qid && r.image && !imageByQid.has(qid)) imageByQid.set(qid, r.image);
      }
    }
    for (const mp of mps) {
      const ref = mp.wikidataId ? imageByQid.get(mp.wikidataId) : undefined;
      await this.applyPhoto(mp.id, ref, mp.imageSourceRef, force, summary);
    }
  }

  /** Federal House: join by electorate (one member per division). */
  private async syncFederalHouse(summary: ImageSyncSummary, force: boolean): Promise<void> {
    const mps = await this.prisma.politician.findMany({
      where: { jurisdiction: "FEDERAL", house: "REPS" },
      select: { id: true, electorate: true, imageSourceRef: true },
    });
    if (mps.length === 0) return;
    const rows = await this.wikidata.select(federalHouseImageQuery());
    const imageByElectorate = new Map<string, string>();
    for (const r of rows) {
      if (r.districtLabel && r.image && !imageByElectorate.has(normElectorate(r.districtLabel))) {
        imageByElectorate.set(normElectorate(r.districtLabel), r.image);
      }
    }
    for (const mp of mps) {
      const ref = mp.electorate ? imageByElectorate.get(normElectorate(mp.electorate)) : undefined;
      await this.applyPhoto(mp.id, ref, mp.imageSourceRef, force, summary);
    }
  }

  /** Mirror + persist one photo, skipping an unchanged source unless forced. */
  private async applyPhoto(
    id: string,
    ref: string | undefined,
    existingRef: string | null,
    force: boolean,
    summary: ImageSyncSummary,
  ): Promise<void> {
    if (!ref) {
      summary.unmatched += 1;
      return;
    }
    // Skip re-fetching a photo whose source filename hasn't changed.
    if (!force && existingRef && commonsFilename(ref) === existingRef) {
      summary.skipped += 1;
      return;
    }
    const mirrored = await this.commons.mirror(ref, id);
    if (!mirrored) {
      summary.unmatched += 1;
      return;
    }
    await this.prisma.politician.update({
      where: { id },
      data: {
        imageUrl: mirrored.imageUrl,
        imageSourceUrl: mirrored.imageSourceUrl,
        imageCredit: mirrored.imageCredit,
        imageLicence: mirrored.imageLicence,
        imageSourceRef: mirrored.imageSourceRef,
      },
    });
    summary.updated += 1;
  }
}

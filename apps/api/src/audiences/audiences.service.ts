import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  AudienceChannel,
  AudienceImportStatus,
  AudienceKind,
  AudienceSegmentType,
  AudienceSource,
  AudienceStatus,
  ConsentState,
  IntegrationJobStatus,
  MessageChannel,
  Prisma,
} from "@uprise/db";
import { parse } from "csv-parse/sync";
import { PrismaService } from "../prisma/prisma.service";
import { normalizePhoneE164 } from "../common/utils/phone.utils";
import {
  sanitizeMetadata,
  withDefaultContactable,
  type MetadataRecord,
} from "../common/utils/metadata.utils";
import { ConfigService } from "@nestjs/config";
import { CreateAudienceDto, ListAudiencesDto } from "./dto/audience.dto";
import { FeatureFlagsService } from "../common/flags/feature-flags.service";
import { DispatchQueue } from "../common/queue/dispatch-queue";
import {
  getAudienceImportJobId,
  getSegmentEvalJobId,
  QUEUE_JOB_TYPES,
  QUEUE_NAMES,
} from "../common/queue/queue.constants";
import { DISPATCH_QUEUE_TOKEN } from "../common/queue/queue.tokens";
import { AudienceImportBatchJobPayload } from "../common/queue/queue.payloads";
import { ContactsService } from "../contacts/contacts.service";

type CsvRow = Record<string, string | undefined>;
/** A CSV row that normalised cleanly – what the import writers actually persist. */
type PreparedImportRow = {
  rowNumber: number;
  phoneE164: string;
  fullName: string | null;
  metadata: MetadataRecord;
};
/** The narrow AudienceContact projection the CSV export reads (+ its keyset columns). */
type ExportRow = {
  id: string;
  createdAt: Date;
  fullName: string | null;
  phoneE164: string;
  metadata: Prisma.JsonValue;
};
type ImportErrorRow = { row: number; message: string };
type AudienceImportProgress = {
  importId: string;
  audienceId: string;
  status: AudienceImportStatus;
  fileName: string;
  cursor: number;
  totalRows: number;
  importedRows: number;
  failedRows: number;
  errorSummary: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  remainingRows: number;
};

function parseSyncStats(summary: string | null | undefined): Record<string, unknown> | null {
  if (!summary) return null;
  try {
    const parsed = JSON.parse(summary) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") return parsed;
    return null;
  } catch {
    return null;
  }
}

// A sync job is "stalled" when it has waited far longer than a healthy worker
// would take — either QUEUED but never picked up (the worker is down or pointed at
// a different Redis/prefix), or RUNNING well past a chunk's ~114s run budget (the
// worker died mid-run). Surfaced so the UI can say "stuck — the importer may not be
// running" instead of showing a never-touched, all-zero summary as if it were a
// finished import that returned nothing. SUCCEEDED/FAILED are terminal → never stalled.
const SYNC_QUEUED_STALL_MS = 120_000; // 2 min: a live worker consumes near-instantly
const SYNC_RUNNING_STALL_MS = 300_000; // 5 min: >> one chunk's run budget

export function isSyncStalled(
  status: IntegrationJobStatus,
  createdAt: Date,
  startedAt: Date | null,
  now: number = Date.now(),
): boolean {
  if (status === IntegrationJobStatus.QUEUED) {
    return now - createdAt.getTime() > SYNC_QUEUED_STALL_MS;
  }
  if (status === IntegrationJobStatus.RUNNING) {
    return now - (startedAt ?? createdAt).getTime() > SYNC_RUNNING_STALL_MS;
  }
  return false;
}

@Injectable()
export class AudiencesService {
  private readonly logger = new Logger(AudiencesService.name);
  private readonly flags: Pick<FeatureFlagsService, "isEnabled">;
  private readonly queue: DispatchQueue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    flags?: FeatureFlagsService,
    @Inject(DISPATCH_QUEUE_TOKEN) queue?: DispatchQueue,
    private readonly contacts?: ContactsService,
  ) {
    this.flags = flags ?? {
      isEnabled: async () => false,
    };
    this.queue = queue ?? {
      enqueue: async (job) => ({ jobId: job.id, queued: true }),
    };
  }

  async createAudience(tenantId: string, dto: CreateAudienceDto) {
    return this.prisma.audience.create({
      data: {
        tenantId,
        name: dto.name,
        source: (dto.source || "MANUAL") as AudienceSource,
        channel: (dto.channel || "ALL") as AudienceChannel,
        kind: (dto.kind || "STATIC") as AudienceKind,
        status: AudienceStatus.ACTIVE,
      },
    });
  }

  /**
   * The org's single dynamic "all WhatsApp opt-ins" audience — created on demand,
   * idempotent. Its members resolve at send time from ContactConsent (see
   * blasts.service getBlastRecipients).
   */
  async ensureWhatsappOptInAudience(tenantId: string) {
    const existing = await this.prisma.audience.findFirst({
      where: { tenantId, kind: AudienceKind.WHATSAPP_OPTED_IN, status: AudienceStatus.ACTIVE },
    });
    if (existing) return existing;
    return this.prisma.audience.create({
      data: {
        tenantId,
        name: "WhatsApp opt-ins (all)",
        source: AudienceSource.INTERNAL,
        channel: AudienceChannel.WHATSAPP,
        kind: AudienceKind.WHATSAPP_OPTED_IN,
        status: AudienceStatus.ACTIVE,
      },
    });
  }

  /**
   * How many of an audience's members are actually WhatsApp-reachable (opted in).
   *
   * Two integers, so the counting stays in Postgres: the dynamic opt-in audience is
   * a `COUNT(DISTINCT phone)` over the consent ledger, and a static audience is one
   * semi-join of its members against that ledger. Previously both sides were pulled
   * into memory in full and intersected in JS.
   */
  async whatsappReach(tenantId: string, audienceId: string): Promise<{ total: number; reachable: number }> {
    const audience = await this.prisma.audience.findFirst({
      where: { id: audienceId, tenantId },
    });
    if (!audience) throw new NotFoundException("Audience not found");

    if (audience.kind === AudienceKind.WHATSAPP_OPTED_IN) {
      // Members resolve at send time from the ledger itself – distinct phones, as the
      // in-memory Set of phone numbers used to be.
      const [row] = await this.prisma.$queryRaw<Array<{ optedIn: bigint }>>(Prisma.sql`
        SELECT COUNT(DISTINCT cc."phoneE164") AS "optedIn"
          FROM messaging."ContactConsent" cc
         WHERE cc."tenantId" = ${tenantId}
           AND cc."channel" = ${MessageChannel.WHATSAPP}::messaging."MessageChannel"
           AND cc."state" = ${ConsentState.OPTED_IN}::messaging."ConsentState"
      `);
      const optedIn = Number(row?.optedIn ?? 0);
      return { total: optedIn, reachable: optedIn };
    }

    // `total` counts member ROWS (not distinct phones), matching the old
    // `members.length`; `reachable` is the semi-join against the tenant's opt-ins.
    const [row] = await this.prisma.$queryRaw<Array<{ total: bigint; reachable: bigint }>>(Prisma.sql`
      SELECT COUNT(*) AS "total",
             COUNT(*) FILTER (
               WHERE EXISTS (
                 SELECT 1
                   FROM messaging."ContactConsent" cc
                  WHERE cc."tenantId" = ${tenantId}
                    AND cc."channel" = ${MessageChannel.WHATSAPP}::messaging."MessageChannel"
                    AND cc."state" = ${ConsentState.OPTED_IN}::messaging."ConsentState"
                    AND cc."phoneE164" = ac."phoneE164"
               )
             ) AS "reachable"
        FROM audience."AudienceContact" ac
       WHERE ac."audienceId" = ${audienceId}
    `);
    return { total: Number(row?.total ?? 0), reachable: Number(row?.reachable ?? 0) };
  }

  async listAudiences(tenantId: string, dto: ListAudiencesDto) {
    const channelFilter: Prisma.AudienceWhereInput =
      dto.channel === "WHATSAPP"
        ? { channel: { in: [AudienceChannel.WHATSAPP, AudienceChannel.ALL] } }
        : dto.channel === "SMS"
          ? { channel: { in: [AudienceChannel.SMS, AudienceChannel.ALL] } }
          : dto.channel === "ALL"
            ? { channel: AudienceChannel.ALL }
            : {};
    const where: Prisma.AudienceWhereInput = {
      tenantId,
      ...(dto.status ? { status: dto.status as AudienceStatus } : {}),
      ...(dto.source ? { source: dto.source as AudienceSource } : {}),
      ...channelFilter,
    };
    const [rows, total] = await Promise.all([
      this.prisma.audience.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: dto.limit,
        skip: dto.offset,
        include: {
          _count: { select: { contacts: true } },
        },
      }),
      this.prisma.audience.count({ where }),
    ]);
    return { rows, total };
  }

  /** Reserved name of the default dynamic segment auto-created for an imported audience. */
  private static readonly IMPORT_SEGMENT_NAME = "Imported contacts";

  /** Keyset page size for the CSV export walk. */
  private static readonly EXPORT_PAGE_SIZE = 1000;

  /** Rows per import write. Big enough to amortise the round trips, small enough
   *  that one poison row only costs a chunk's worth of row-at-a-time replay. */
  private static readonly IMPORT_CHUNK_SIZE = 500;

  /** Provenance source-system key for an audience source — matches what the import
   *  writes to ContactSourceRecord (see IntegrationsService.sourceSystemFor). */
  private sourceSystemForAudience(source: AudienceSource): string {
    switch (source) {
      case AudienceSource.ACTION_NETWORK:
        return "action_network";
      case AudienceSource.INTERNAL:
        return "internal_source";
      case AudienceSource.CSV:
        return "csv";
      default:
        return "manual";
    }
  }

  /**
   * Ensure the default "Imported contacts" DYNAMIC segment exists for an audience and
   * (re-)materialise its membership. Called from the `audience.imported` reaction after
   * a sync completes. Idempotent: reuses the segment on re-sync, and the stable
   * segment-eval jobId dedupes concurrent evaluations. Returns null if the audience is
   * gone (e.g. deleted between the event and the reaction).
   */
  async ensureImportSegment(
    tenantId: string,
    audienceId: string,
  ): Promise<{ segmentId: string; created: boolean } | null> {
    const audience = await this.prisma.audience.findFirst({
      where: { id: audienceId, tenantId },
      select: { id: true, source: true },
    });
    if (!audience) return null;

    const sourceSystem = this.sourceSystemForAudience(audience.source);
    const existing = await this.prisma.audienceSegment.findFirst({
      where: {
        tenantId,
        audienceId,
        type: AudienceSegmentType.DYNAMIC,
        name: AudiencesService.IMPORT_SEGMENT_NAME,
      },
      select: { id: true },
    });
    const segment =
      existing ??
      (await this.prisma.audienceSegment.create({
        data: {
          tenantId,
          audienceId,
          name: AudiencesService.IMPORT_SEGMENT_NAME,
          type: AudienceSegmentType.DYNAMIC,
          definition: { type: "hasSource", sourceSystem } as Prisma.InputJsonValue,
        },
        select: { id: true },
      }));

    // Re-materialise membership on the built-in segment-eval worker. Stable jobId
    // collapses duplicate evals from a re-sync / event replay.
    await this.queue.enqueue({
      id: getSegmentEvalJobId(segment.id),
      queue: QUEUE_NAMES.SEGMENT_EVAL,
      type: QUEUE_JOB_TYPES.SEGMENT_EVAL_RUN,
      payload: { segmentId: segment.id },
      removeOnComplete: true,
    });

    return { segmentId: segment.id, created: !existing };
  }

  /** Dynamic/static segments for the tenant, with live member counts and their
   *  parent audience — backs the admin "Dynamic Segments" surface. */
  async listSegments(tenantId: string) {
    const rows = await this.prisma.audienceSegment.findMany({
      where: { tenantId },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { members: true } },
        audience: { select: { id: true, name: true, source: true, syncedAt: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      audienceId: r.audienceId,
      audienceName: r.audience?.name ?? null,
      source: r.audience?.source ?? null,
      syncedAt: r.audience?.syncedAt ?? null,
      memberCount: r._count.members,
      updatedAt: r.updatedAt,
    }));
  }

  async getAudience(tenantId: string, id: string) {
    const [audience, latestSync] = await Promise.all([
      this.prisma.audience.findFirst({
        where: {
          id,
          tenantId,
        },
        include: {
          _count: { select: { contacts: true } },
        },
      }),
      this.prisma.integrationSyncJob.findFirst({
        where: {
          tenantId,
          audienceId: id,
        },
        /**
         * Newest job WINS, by creation — not by completion.
         *
         * `completedAt DESC` looks like "most recent sync" and is the opposite in Postgres, where
         * DESC sorts NULLS FIRST. A job that never completed — the stranded QUEUED import this
         * card exists to surface — has completedAt NULL, so it outranked every later job and kept
         * outranking them: an organisation could sync successfully a dozen times and the audience
         * would still report the months-old stuck import as its latest sync.
         *
         * createdAt is the honest key. It is monotonic, and it keeps a genuinely in-flight sync on
         * top (where the card needs it to show progress) without letting a dead one sit there
         * forever. `id` breaks ties within the same millisecond so the answer is deterministic.
         */
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    ]);
    if (!audience) {
      throw new NotFoundException("Audience not found");
    }
    return {
      ...audience,
      latestSync: latestSync
        ? {
            id: latestSync.id,
            status: latestSync.status,
            syncedCount: latestSync.syncedCount,
            failedCount: latestSync.failedCount,
            remoteListId: latestSync.remoteListId,
            // Both carried so the UI can re-request this exact sync. Without `query` a re-sync of
            // a filtered list would silently pull the whole list into an audience that was meant
            // to be a subset; without the connection id, requireConnection falls back to picking
            // by type, which is the wrong account for a tenant holding more than one.
            query: latestSync.query,
            integrationConnectionId: latestSync.integrationConnectionId,
            errorSummary: latestSync.errorSummary,
            completedAt: latestSync.completedAt,
            createdAt: latestSync.createdAt,
            startedAt: latestSync.startedAt,
            stalled: isSyncStalled(latestSync.status, latestSync.createdAt, latestSync.startedAt),
            stats: parseSyncStats(latestSync.errorSummary),
          }
        : null,
    };
  }

  async archiveAudience(tenantId: string, id: string) {
    const audience = await this.prisma.audience.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!audience) throw new NotFoundException("Audience not found");
    return this.prisma.audience.update({
      where: { id: audience.id },
      data: { status: AudienceStatus.ARCHIVED, archivedAt: new Date() },
    });
  }

  async restoreAudience(tenantId: string, id: string) {
    const audience = await this.prisma.audience.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!audience) throw new NotFoundException("Audience not found");
    return this.prisma.audience.update({
      where: { id: audience.id },
      data: { status: AudienceStatus.ACTIVE, archivedAt: null },
    });
  }

  async deleteAudience(tenantId: string, id: string) {
    const audience = await this.prisma.audience.findFirst({
      where: {
        id,
        tenantId,
      },
      select: { id: true },
    });
    if (!audience) throw new NotFoundException("Audience not found");

    await this.prisma.audience.delete({
      where: { id: audience.id },
    });
    return { ok: true };
  }

  private parseCsvRows(csvRaw: string): CsvRow[] {
    return parse(csvRaw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as CsvRow[];
  }

  private getImportBatchSize(requestedBatchSize?: number): number {
    const envBatchSize = Number(this.config.get<string>("AUDIENCE_IMPORT_BATCH_SIZE", "1900"));
    const fallback = Number.isFinite(envBatchSize) ? envBatchSize : 1900;
    const effective = requestedBatchSize ?? fallback;
    return Math.min(Math.max(1, Math.trunc(effective)), 2000);
  }

  private getImportDispatchBatchSize(): number {
    const envBatchSize = Number(this.config.get<string>("AUDIENCE_IMPORT_DISPATCH_BATCH_SIZE", "475"));
    const fallback = Number.isFinite(envBatchSize) ? envBatchSize : 475;
    return Math.min(Math.max(1, Math.trunc(fallback)), 500);
  }

  private getImportDispatchLimit(): number {
    const envLimit = Number(this.config.get<string>("AUDIENCE_IMPORT_DISPATCH_LIMIT", "95"));
    const fallback = Number.isFinite(envLimit) ? envLimit : 95;
    return Math.min(Math.max(1, Math.trunc(fallback)), 100);
  }

  private getImportTimeBudgetMs(): number {
    const envBudgetMs = Number(this.config.get<string>("AUDIENCE_IMPORT_MAX_RUN_MS", "26600"));
    const fallback = Number.isFinite(envBudgetMs) ? envBudgetMs : 26600;
    return Math.min(Math.max(1000, Math.trunc(fallback)), 28000);
  }

  private isBullmqUploadEnabled(): Promise<boolean> {
    return this.flags.isEnabled("FEATURE_BULLMQ_UPLOAD_ENABLED", { tenantId: null });
  }

  private async enqueueImportBatch(
    payload: AudienceImportBatchJobPayload,
    runAt?: Date,
    chunkKey?: string,
  ): Promise<{ jobId: string; queued: boolean }> {
    return this.queue.enqueue({
      id: getAudienceImportJobId(payload.importId, chunkKey),
      queue: QUEUE_NAMES.AUDIENCE_IMPORT,
      type: QUEUE_JOB_TYPES.AUDIENCE_IMPORT_BATCH,
      payload,
      runAt,
      removeOnComplete: true,
    });
  }

  async processImportQueueJob(payload: AudienceImportBatchJobPayload) {
    return this.processImportBatch(payload.importId, payload.requestedBatchSize);
  }

  private getStoredImportErrors(
    existing: Prisma.JsonValue | null | undefined,
    newRows: ImportErrorRow[],
  ): ImportErrorRow[] {
    const current = Array.isArray(existing) ? (existing as ImportErrorRow[]) : [];
    const merged = [...current, ...newRows];
    return merged.slice(-500);
  }

  private mapImportProgress(job: {
    id: string;
    audienceId: string;
    status: AudienceImportStatus;
    fileName: string;
    cursor: number;
    totalRows: number;
    importedRows: number;
    failedRows: number;
    errorSummary: string | null;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
  }): AudienceImportProgress {
    return {
      importId: job.id,
      audienceId: job.audienceId,
      status: job.status,
      fileName: job.fileName,
      cursor: job.cursor,
      totalRows: job.totalRows,
      importedRows: job.importedRows,
      failedRows: job.failedRows,
      errorSummary: job.errorSummary,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      remainingRows: Math.max(0, job.totalRows - job.cursor),
    };
  }

  async startCsvImport(tenantId: string, audienceId: string, fileName: string, csvRaw: string) {
    const audience = await this.prisma.audience.findFirst({
      where: { id: audienceId, tenantId },
    });
    if (!audience) throw new NotFoundException("Audience not found");

    const rows = this.parseCsvRows(csvRaw);

    const created = await this.prisma.audienceImport.create({
      data: {
        tenantId,
        audienceId,
        fileName,
        totalRows: rows.length,
        importedRows: 0,
        failedRows: 0,
        cursor: 0,
        csvRaw,
        status: AudienceImportStatus.QUEUED,
        errors: [] as Prisma.InputJsonValue,
        startedAt: null,
        completedAt: null,
        errorSummary: null,
      },
      select: {
        id: true,
      },
    });

    if (await this.isBullmqUploadEnabled()) {
      await this.enqueueImportBatch({ importId: created.id });
      return this.getImportStatus(tenantId, audienceId, created.id);
    }

    return this.processImportBatch(created.id);
  }

  async getImportStatus(tenantId: string, audienceId: string, importId: string) {
    const job = await this.prisma.audienceImport.findFirst({
      where: {
        id: importId,
        audienceId,
        tenantId,
      },
      select: {
        id: true,
        audienceId: true,
        status: true,
        fileName: true,
        cursor: true,
        totalRows: true,
        importedRows: true,
        failedRows: true,
        errorSummary: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
      },
    });
    if (!job) throw new NotFoundException("Audience import job not found");
    return this.mapImportProgress(job);
  }

  /**
   * Normalise one CSV row into what the writers need, or the error to report against
   * it. Shared by the chunk path and the row-at-a-time fallback so a row is judged
   * identically either way.
   */
  private prepareImportRow(row: CsvRow, rowNumber: number): PreparedImportRow | ImportErrorRow {
    const phoneRaw = row.phone || row.phone_number || row.mobile;
    if (!phoneRaw) return { row: rowNumber, message: "Missing phone" };
    try {
      return {
        rowNumber,
        phoneE164: normalizePhoneE164(phoneRaw),
        fullName: row.name || row.full_name || row.first_name || null,
        metadata: withDefaultContactable(sanitizeMetadata(row)),
      };
    } catch (error) {
      return { row: rowNumber, message: String(error) };
    }
  }

  /**
   * Write one chunk of CSV rows in a fixed number of queries, falling back to the
   * row-at-a-time path if the set write fails.
   *
   * The old shape was two round trips per row – resolve the Contact, upsert the
   * AudienceContact – which is what made a 100k-row import an hours-long job. A
   * chunk now costs a handful of queries no matter how many rows are in it.
   *
   * The fallback is what keeps per-row error reporting honest: a set write can only
   * tell us the whole statement failed, so when one does we replay the chunk one row
   * at a time and let each bad row name itself. Chunks are small enough that this is
   * cheap, and the common case never pays for it.
   */
  private async writeImportChunk(
    job: { id: string; tenantId: string; audienceId: string },
    chunk: CsvRow[],
    firstRowNumber: number,
  ): Promise<{ imported: number; failed: number; errors: ImportErrorRow[] }> {
    const errors: ImportErrorRow[] = [];
    const prepared: PreparedImportRow[] = [];
    chunk.forEach((row, i) => {
      const outcome = this.prepareImportRow(row, firstRowNumber + i);
      if ("message" in outcome) errors.push(outcome);
      else prepared.push(outcome);
    });
    if (prepared.length === 0) return { imported: 0, failed: errors.length, errors };

    // A phone repeated inside the chunk collapses to its LAST row – the same result
    // the row-at-a-time upsert produced, where each later write overwrote the earlier.
    const byPhone = new Map<string, PreparedImportRow>();
    for (const p of prepared) byPhone.set(p.phoneE164, p);
    const writes = [...byPhone.values()];

    try {
      const contactIds = this.contacts
        ? await this.contacts.getOrCreateManyByPhone(
            job.tenantId,
            writes.map((w) => ({ phoneE164: w.phoneE164, seed: { fullName: w.fullName } })),
          )
        : new Map<string, string>();
      await this.upsertAudienceContacts(job, writes, contactIds);
      // Every prepared row counts as imported, including ones a later duplicate
      // superseded – the row-at-a-time path counted each of those too.
      return { imported: prepared.length, failed: errors.length, errors };
    } catch (error) {
      this.logger.warn(
        `Audience import chunk failed, replaying row-at-a-time for per-row errors (importId=${job.id}, rows=${firstRowNumber}-${firstRowNumber + chunk.length - 1}): ${String(error)}`,
      );
      const replay = await this.writeImportRowsIndividually(job, prepared);
      return {
        imported: replay.imported,
        failed: errors.length + replay.failed,
        errors: [...errors, ...replay.errors],
      };
    }
  }

  /**
   * One multi-row `INSERT … ON CONFLICT DO UPDATE` for the chunk's AudienceContacts.
   *
   * `unnest` of parallel arrays is what makes it a single statement while keeping
   * per-row values: `createMany` + `updateMany` cannot express "each row gets its
   * own name and metadata". `contactId` is COALESCEd on update so an unresolved
   * contact leaves an existing link alone, matching the old upsert, where an
   * `undefined` contactId meant "do not change".
   */
  private async upsertAudienceContacts(
    job: { tenantId: string; audienceId: string },
    writes: PreparedImportRow[],
    contactIds: Map<string, string>,
  ): Promise<void> {
    const ids = writes.map(() => randomUUID());
    const phones = writes.map((w) => w.phoneE164);
    const linked = writes.map((w) => contactIds.get(w.phoneE164) ?? null);
    const names = writes.map((w) => w.fullName);
    const metadata = writes.map((w) => JSON.stringify(w.metadata));

    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO audience."AudienceContact" (
        "id", "tenantId", "audienceId", "contactId", "phoneE164",
        "fullName", "metadata", "source", "createdAt", "updatedAt"
      )
      SELECT r."id", ${job.tenantId}, ${job.audienceId}, r."contactId", r."phoneE164",
             r."fullName", r."metadata"::jsonb,
             ${AudienceSource.CSV}::audience."AudienceSource", now(), now()
        FROM unnest(
               ${ids}::text[], ${phones}::text[], ${linked}::text[],
               ${names}::text[], ${metadata}::text[]
             ) AS r("id", "phoneE164", "contactId", "fullName", "metadata")
      ON CONFLICT ("audienceId", "phoneE164") DO UPDATE
         SET "contactId" = COALESCE(EXCLUDED."contactId", audience."AudienceContact"."contactId"),
             "fullName"  = EXCLUDED."fullName",
             "metadata"  = EXCLUDED."metadata",
             "source"    = EXCLUDED."source",
             "updatedAt" = now()
    `);
  }

  /** The original row-at-a-time write, kept as the fallback that names bad rows. */
  private async writeImportRowsIndividually(
    job: { tenantId: string; audienceId: string },
    prepared: PreparedImportRow[],
  ): Promise<{ imported: number; failed: number; errors: ImportErrorRow[] }> {
    let imported = 0;
    let failed = 0;
    const errors: ImportErrorRow[] = [];
    for (const p of prepared) {
      try {
        const contact = this.contacts
          ? await this.contacts.getOrCreateByPhone(job.tenantId, p.phoneE164, {
              fullName: p.fullName,
            })
          : null;
        await this.prisma.audienceContact.upsert({
          where: {
            audienceId_phoneE164: { audienceId: job.audienceId, phoneE164: p.phoneE164 },
          },
          update: {
            contactId: contact?.id,
            fullName: p.fullName,
            metadata: p.metadata,
            source: AudienceSource.CSV,
          },
          create: {
            tenantId: job.tenantId,
            audienceId: job.audienceId,
            contactId: contact?.id,
            phoneE164: p.phoneE164,
            fullName: p.fullName,
            metadata: p.metadata,
            source: AudienceSource.CSV,
          },
        });
        imported += 1;
      } catch (error) {
        errors.push({ row: p.rowNumber, message: String(error) });
        failed += 1;
      }
    }
    return { imported, failed, errors };
  }

  async processImportBatch(importId: string, requestedBatchSize?: number) {
    const job = await this.prisma.audienceImport.findFirst({
      where: {
        id: importId,
      },
      select: {
        id: true,
        tenantId: true,
        audienceId: true,
        fileName: true,
        status: true,
        cursor: true,
        totalRows: true,
        importedRows: true,
        failedRows: true,
        errors: true,
        csvRaw: true,
        errorSummary: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
      },
    });
    if (!job) throw new NotFoundException("Audience import job not found");
    if (job.status === AudienceImportStatus.SUCCEEDED || job.status === AudienceImportStatus.FAILED) {
      return this.mapImportProgress(job);
    }

    const audience = await this.prisma.audience.findFirst({
      where: { id: job.audienceId, tenantId: job.tenantId },
      select: { id: true },
    });
    if (!audience) {
      await this.prisma.audienceImport.update({
        where: { id: job.id },
        data: {
          status: AudienceImportStatus.FAILED,
          errorSummary: "Audience not found",
          completedAt: new Date(),
          startedAt: job.startedAt ?? new Date(),
        },
      });
      throw new NotFoundException("Audience not found");
    }

    const batchSize = this.getImportBatchSize(requestedBatchSize);
    const runBudgetMs = this.getImportTimeBudgetMs();
    const startedAtMs = Date.now();
    const rows = this.parseCsvRows(job.csvRaw || "");
    const initialCursor = Math.min(Math.max(0, job.cursor), rows.length);
    let cursor = initialCursor;
    let importedDelta = 0;
    let failedDelta = 0;
    const errorsForBatch: ImportErrorRow[] = [];
    let processedInBatch = 0;

    while (cursor < rows.length && processedInBatch < batchSize) {
      const elapsedMs = Date.now() - startedAtMs;
      if (elapsedMs >= runBudgetMs) {
        this.logger.warn(
          `Stopping audience import batch due to runtime budget (importId=${job.id}, cursor=${cursor}, elapsedMs=${elapsedMs}, budgetMs=${runBudgetMs})`,
        );
        break;
      }
      const chunkSize = Math.min(
        AudiencesService.IMPORT_CHUNK_SIZE,
        batchSize - processedInBatch,
        rows.length - cursor,
      );
      const outcome = await this.writeImportChunk(
        job,
        rows.slice(cursor, cursor + chunkSize),
        cursor + 1,
      );
      importedDelta += outcome.imported;
      failedDelta += outcome.failed;
      errorsForBatch.push(...outcome.errors);
      cursor += chunkSize;
      processedInBatch += chunkSize;
    }

    const done = cursor >= rows.length;
    const nextStatus = done ? AudienceImportStatus.SUCCEEDED : AudienceImportStatus.RUNNING;
    const importedRows = job.importedRows + importedDelta;
    const failedRows = job.failedRows + failedDelta;
    const storedErrors = this.getStoredImportErrors(job.errors, errorsForBatch);
    const errorSummary = done
      ? failedRows > 0
        ? `Completed with ${failedRows} failed rows`
        : null
      : job.errorSummary;

    const updated = await this.prisma.audienceImport.update({
      where: { id: job.id },
      data: {
        status: nextStatus,
        cursor,
        totalRows: rows.length,
        importedRows,
        failedRows,
        errors: storedErrors as Prisma.InputJsonValue,
        errorSummary,
        startedAt: job.startedAt ?? new Date(),
        completedAt: done ? new Date() : null,
      },
      select: {
        id: true,
        audienceId: true,
        status: true,
        fileName: true,
        cursor: true,
        totalRows: true,
        importedRows: true,
        failedRows: true,
        errorSummary: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
      },
    });

    if (done) {
      await this.prisma.audience.update({
        where: { id: job.audienceId },
        data: {
          source: AudienceSource.CSV,
          syncedAt: new Date(),
        },
      });
    } else if (await this.isBullmqUploadEnabled()) {
      await this.enqueueImportBatch(
        {
          importId: job.id,
          requestedBatchSize: batchSize,
        },
        undefined,
        `cursor-${cursor}`,
      );
    }

    const progress = this.mapImportProgress(updated);
    const elapsedMs = Math.max(1, Date.now() - startedAtMs);
    return {
      ...progress,
      batchSize,
      processedInBatch,
      elapsedMs,
      rowsPerSecond: Number(((processedInBatch / elapsedMs) * 1000).toFixed(2)),
    };
  }

  async dispatchPendingImports(limit?: number) {
    const effectiveLimit = limit ?? this.getImportDispatchLimit();
    const boundedLimit = Math.min(Math.max(1, Math.trunc(effectiveLimit || 1)), 100);
    const batchSize = this.getImportDispatchBatchSize();
    const due = await this.prisma.audienceImport.findMany({
      where: {
        status: { in: [AudienceImportStatus.QUEUED, AudienceImportStatus.RUNNING] },
      },
      orderBy: [{ createdAt: "asc" }, { updatedAt: "asc" }],
      take: boundedLimit,
      select: { id: true, audienceId: true },
    });

    const results: Array<Record<string, unknown>> = [];
    for (const job of due) {
      if (await this.isBullmqUploadEnabled()) {
        const queued = await this.enqueueImportBatch({
          importId: job.id,
          requestedBatchSize: batchSize,
        });
        results.push({
          importId: job.id,
          audienceId: job.audienceId,
          ok: true,
          queued: queued.queued,
          jobId: queued.jobId,
        });
        continue;
      }
      try {
        const outcome = await this.processImportBatch(job.id, batchSize);
        results.push({
          importId: job.id,
          audienceId: job.audienceId,
          ok: true,
          status: outcome.status,
          cursor: outcome.cursor,
          totalRows: outcome.totalRows,
          importedRows: outcome.importedRows,
          failedRows: outcome.failedRows,
          remainingRows: outcome.remainingRows,
        });
      } catch (error) {
        results.push({
          importId: job.id,
          audienceId: job.audienceId,
          ok: false,
          error: String(error),
        });
      }
    }

    return {
      processed: due.length,
      dispatchLimit: boundedLimit,
      batchSize,
      results,
    };
  }

  async listContacts(tenantId: string, audienceId: string, limit: number, offset: number) {
    const a = await this.prisma.audience.findFirst({ where: { id: audienceId, tenantId } });
    if (!a) throw new NotFoundException("Audience not found");
    const rows = await this.prisma.audienceContact.findMany({
      where: { audienceId },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
    const total = await this.prisma.audienceContact.count({ where: { audienceId } });
    return { rows, total };
  }

  async searchContacts(tenantId: string, audienceId: string, query: string, limit: number, offset: number) {
    const a = await this.prisma.audience.findFirst({ where: { id: audienceId, tenantId } });
    if (!a) throw new NotFoundException("Audience not found");
    const q = query.trim();
    const where: Prisma.AudienceContactWhereInput = {
      audienceId,
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { phoneE164: { contains: q } },
      ],
    };
    const rows = await this.prisma.audienceContact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
    const total = await this.prisma.audienceContact.count({ where });
    return { rows, total };
  }

  /**
   * Export the audience as CSV.
   *
   * Read in keyset pages rather than one unbounded `findMany` of full rows: only the
   * three columns the CSV prints are selected, and each page walks forward from the
   * last `(createdAt, id)` seen, which the `(audienceId, createdAt)` index serves
   * directly. `id` is the tiebreak – without it, rows sharing a `createdAt` could
   * straddle a page boundary and be repeated or skipped.
   */
  async exportContactsCsv(tenantId: string, audienceId: string): Promise<string> {
    const a = await this.prisma.audience.findFirst({ where: { id: audienceId, tenantId } });
    if (!a) throw new NotFoundException("Audience not found");

    const lines: string[] = [];
    let cursor: { createdAt: Date; id: string } | null = null;
    for (;;) {
      // Annotated: the keyset `where` reads `cursor`, which the tail of the loop
      // writes back from `page` – without it TS chases that as a circular inference.
      const page: ExportRow[] = await this.prisma.audienceContact.findMany({
        where: {
          audienceId,
          ...(cursor
            ? {
                OR: [
                  { createdAt: { gt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: AudiencesService.EXPORT_PAGE_SIZE,
        select: { id: true, createdAt: true, fullName: true, phoneE164: true, metadata: true },
      });
      if (page.length === 0) break;
      for (const contact of page) {
        const name = JSON.stringify(contact.fullName || "");
        const phone = JSON.stringify(contact.phoneE164);
        const metadata = JSON.stringify(JSON.stringify(contact.metadata || {}));
        lines.push(`${name},${phone},${metadata}`);
      }
      if (page.length < AudiencesService.EXPORT_PAGE_SIZE) break;
      const last = page[page.length - 1];
      cursor = { createdAt: last.createdAt, id: last.id };
    }

    const header = "name,phone,metadata\n";
    return header + lines.join("\n");
  }

  async growthMetrics(tenantId: string, audienceId: string) {
    const a = await this.prisma.audience.findFirst({ where: { id: audienceId, tenantId } });
    if (!a) throw new NotFoundException("Audience not found");
    const [total, last7] = await Promise.all([
      this.prisma.audienceContact.count({ where: { audienceId } }),
      this.prisma.audienceContact.count({
        where: {
          audienceId,
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);
    return {
      totalSubscribers: total,
      addedLast7Days: last7,
    };
  }

  async segmentationSummary(tenantId: string, audienceId: string) {
    const a = await this.prisma.audience.findFirst({ where: { id: audienceId, tenantId } });
    if (!a) throw new NotFoundException("Audience not found");
    const grouped = await this.prisma.audienceContact.groupBy({
      by: ["source"],
      where: { audienceId },
      _count: true,
    });
    return grouped.map((g) => ({
      segment: g.source,
      count: g._count,
    }));
  }
}

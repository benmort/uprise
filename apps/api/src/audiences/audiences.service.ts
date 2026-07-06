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
import { sanitizeMetadata, withDefaultContactable } from "../common/utils/metadata.utils";
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

  /** How many of an audience's members are actually WhatsApp-reachable (opted in). */
  async whatsappReach(tenantId: string, audienceId: string): Promise<{ total: number; reachable: number }> {
    const audience = await this.prisma.audience.findFirst({
      where: { id: audienceId, tenantId },
    });
    if (!audience) throw new NotFoundException("Audience not found");

    const optedIn = await this.prisma.contactConsent.findMany({
      where: { tenantId, channel: MessageChannel.WHATSAPP, state: ConsentState.OPTED_IN },
      select: { phoneE164: true },
    });
    const optInSet = new Set(optedIn.map((c) => c.phoneE164));

    if (audience.kind === AudienceKind.WHATSAPP_OPTED_IN) {
      return { total: optInSet.size, reachable: optInSet.size };
    }
    const members = await this.prisma.audienceContact.findMany({
      where: { audienceId },
      select: { phoneE164: true },
    });
    return {
      total: members.length,
      reachable: members.filter((m) => optInSet.has(m.phoneE164)).length,
    };
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
        orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
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
      const row = rows[cursor];
      const rowNumber = cursor + 1;
      const phoneRaw = row.phone || row.phone_number || row.mobile;
      if (!phoneRaw) {
        errorsForBatch.push({ row: rowNumber, message: "Missing phone" });
        failedDelta += 1;
        cursor += 1;
        processedInBatch += 1;
        continue;
      }
      try {
        const phone = normalizePhoneE164(phoneRaw);
        const fullName = row.name || row.full_name || row.first_name || null;
        const metadata = withDefaultContactable(sanitizeMetadata(row));
        const contact = this.contacts
          ? await this.contacts.getOrCreateByPhone(job.tenantId, phone, { fullName })
          : null;
        await this.prisma.audienceContact.upsert({
          where: {
            audienceId_phoneE164: {
              audienceId: job.audienceId,
              phoneE164: phone,
            },
          },
          update: {
            contactId: contact?.id,
            fullName,
            metadata,
            source: AudienceSource.CSV,
          },
          create: {
            tenantId: job.tenantId,
            audienceId: job.audienceId,
            contactId: contact?.id,
            phoneE164: phone,
            fullName,
            metadata,
            source: AudienceSource.CSV,
          },
        });
        importedDelta += 1;
      } catch (error) {
        errorsForBatch.push({ row: rowNumber, message: String(error) });
        failedDelta += 1;
      }
      cursor += 1;
      processedInBatch += 1;
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

  async exportContactsCsv(tenantId: string, audienceId: string): Promise<string> {
    const a = await this.prisma.audience.findFirst({ where: { id: audienceId, tenantId } });
    if (!a) throw new NotFoundException("Audience not found");
    const contacts = await this.prisma.audienceContact.findMany({
      where: { audienceId },
      orderBy: { createdAt: "asc" },
    });
    const header = "name,phone,metadata\n";
    const lines = contacts.map((contact) => {
      const name = JSON.stringify(contact.fullName || "");
      const phone = JSON.stringify(contact.phoneE164);
      const metadata = JSON.stringify(JSON.stringify(contact.metadata || {}));
      return `${name},${phone},${metadata}`;
    });
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

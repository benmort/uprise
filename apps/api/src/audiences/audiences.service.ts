import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  AudienceImportStatus,
  AudienceSource,
  AudienceStatus,
  Prisma,
} from "../../src/generated/prisma";
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

@Injectable()
export class AudiencesService {
  private readonly logger = new Logger(AudiencesService.name);
  private readonly flags: Pick<FeatureFlagsService, "isBullmqUploadEnabled">;
  private readonly queue: DispatchQueue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    flags?: FeatureFlagsService,
    @Inject(DISPATCH_QUEUE_TOKEN) queue?: DispatchQueue,
    private readonly contacts?: ContactsService,
  ) {
    this.flags = flags ?? {
      isBullmqUploadEnabled: () => false,
    };
    this.queue = queue ?? {
      enqueue: async (job) => ({ jobId: job.id, queued: true }),
    };
  }

  private async ensureOrganization() {
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    return this.prisma.organization.upsert({
      where: { slug },
      create: { slug, name: "Default Organization" },
      update: {},
    });
  }

  async createAudience(dto: CreateAudienceDto) {
    const org = await this.ensureOrganization();
    return this.prisma.audience.create({
      data: {
        organizationId: org.id,
        name: dto.name,
        source: (dto.source || "MANUAL") as AudienceSource,
        status: AudienceStatus.ACTIVE,
      },
    });
  }

  async listAudiences(dto: ListAudiencesDto) {
    const org = await this.ensureOrganization();
    const where: Prisma.AudienceWhereInput = {
      organizationId: org.id,
      ...(dto.status ? { status: dto.status as AudienceStatus } : {}),
      ...(dto.source ? { source: dto.source as AudienceSource } : {}),
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

  async getAudience(id: string) {
    const org = await this.ensureOrganization();
    const [audience, latestSync] = await Promise.all([
      this.prisma.audience.findFirst({
        where: {
          id,
          organizationId: org.id,
        },
        include: {
          _count: { select: { contacts: true } },
        },
      }),
      this.prisma.integrationSyncJob.findFirst({
        where: {
          organizationId: org.id,
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
            stats: parseSyncStats(latestSync.errorSummary),
          }
        : null,
    };
  }

  async archiveAudience(id: string) {
    return this.prisma.audience.update({
      where: { id },
      data: { status: AudienceStatus.ARCHIVED, archivedAt: new Date() },
    });
  }

  async restoreAudience(id: string) {
    return this.prisma.audience.update({
      where: { id },
      data: { status: AudienceStatus.ACTIVE, archivedAt: null },
    });
  }

  async deleteAudience(id: string) {
    const org = await this.ensureOrganization();
    const audience = await this.prisma.audience.findFirst({
      where: {
        id,
        organizationId: org.id,
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

  private isBullmqUploadEnabled(): boolean {
    return this.flags.isBullmqUploadEnabled();
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

  async startCsvImport(audienceId: string, fileName: string, csvRaw: string) {
    const org = await this.ensureOrganization();
    const audience = await this.prisma.audience.findFirst({
      where: { id: audienceId, organizationId: org.id },
    });
    if (!audience) throw new NotFoundException("Audience not found");

    const rows = this.parseCsvRows(csvRaw);

    const created = await this.prisma.audienceImport.create({
      data: {
        organizationId: org.id,
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

    if (this.isBullmqUploadEnabled()) {
      await this.enqueueImportBatch({ importId: created.id });
      return this.getImportStatus(audienceId, created.id);
    }

    return this.processImportBatch(created.id);
  }

  async getImportStatus(audienceId: string, importId: string) {
    const org = await this.ensureOrganization();
    const job = await this.prisma.audienceImport.findFirst({
      where: {
        id: importId,
        audienceId,
        organizationId: org.id,
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
    const org = await this.ensureOrganization();
    const job = await this.prisma.audienceImport.findFirst({
      where: {
        id: importId,
        organizationId: org.id,
      },
      select: {
        id: true,
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
      where: { id: job.audienceId, organizationId: org.id },
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
          ? await this.contacts.getOrCreateByPhone(org.id, phone, { fullName })
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
            organizationId: org.id,
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
    } else if (this.isBullmqUploadEnabled()) {
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
    const org = await this.ensureOrganization();
    const effectiveLimit = limit ?? this.getImportDispatchLimit();
    const boundedLimit = Math.min(Math.max(1, Math.trunc(effectiveLimit || 1)), 100);
    const batchSize = this.getImportDispatchBatchSize();
    const due = await this.prisma.audienceImport.findMany({
      where: {
        organizationId: org.id,
        status: { in: [AudienceImportStatus.QUEUED, AudienceImportStatus.RUNNING] },
      },
      orderBy: [{ createdAt: "asc" }, { updatedAt: "asc" }],
      take: boundedLimit,
      select: { id: true, audienceId: true },
    });

    const results: Array<Record<string, unknown>> = [];
    for (const job of due) {
      if (this.isBullmqUploadEnabled()) {
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

  async listContacts(audienceId: string, limit: number, offset: number) {
    const rows = await this.prisma.audienceContact.findMany({
      where: { audienceId },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
    const total = await this.prisma.audienceContact.count({ where: { audienceId } });
    return { rows, total };
  }

  async searchContacts(audienceId: string, query: string, limit: number, offset: number) {
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

  async exportContactsCsv(audienceId: string): Promise<string> {
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

  async growthMetrics(audienceId: string) {
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

  async segmentationSummary(audienceId: string) {
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

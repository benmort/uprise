import { Injectable, NotFoundException } from "@nestjs/common";
import { AudienceSource, AudienceStatus, Prisma } from "../../src/generated/prisma";
import { parse } from "csv-parse/sync";
import { PrismaService } from "../prisma/prisma.service";
import { normalizePhoneE164 } from "../common/utils/phone.utils";
import { sanitizeMetadata } from "../common/utils/metadata.utils";
import { ConfigService } from "@nestjs/config";
import { CreateAudienceDto, ListAudiencesDto } from "./dto/audience.dto";

type CsvRow = Record<string, string | undefined>;

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

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

  private parseCsvRows(csvRaw: string): CsvRow[] {
    return parse(csvRaw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as CsvRow[];
  }

  async importCsv(audienceId: string, fileName: string, csvRaw: string) {
    const org = await this.ensureOrganization();
    const audience = await this.prisma.audience.findFirst({
      where: { id: audienceId, organizationId: org.id },
    });
    if (!audience) throw new NotFoundException("Audience not found");

    const rows = this.parseCsvRows(csvRaw);
    const errors: Array<{ row: number; message: string }> = [];
    let importedRows = 0;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const phoneRaw = row.phone || row.phone_number || row.mobile;
      if (!phoneRaw) {
        errors.push({ row: i + 1, message: "Missing phone" });
        continue;
      }
      try {
        const phone = normalizePhoneE164(phoneRaw);
        const fullName = row.name || row.full_name || row.first_name || null;
        const metadata = sanitizeMetadata(row);
        await this.prisma.audienceContact.upsert({
          where: {
            audienceId_phoneE164: {
              audienceId,
              phoneE164: phone,
            },
          },
          update: {
            fullName,
            metadata,
            source: AudienceSource.CSV,
          },
          create: {
            organizationId: org.id,
            audienceId,
            phoneE164: phone,
            fullName,
            metadata,
            source: AudienceSource.CSV,
          },
        });
        importedRows += 1;
      } catch (error) {
        errors.push({ row: i + 1, message: String(error) });
      }
    }

    await this.prisma.audienceImport.create({
      data: {
        organizationId: org.id,
        audienceId,
        fileName,
        totalRows: rows.length,
        importedRows,
        failedRows: errors.length,
        errors,
      },
    });

    await this.prisma.audience.update({
      where: { id: audienceId },
      data: {
        source: AudienceSource.CSV,
        syncedAt: new Date(),
      },
    });

    return {
      totalRows: rows.length,
      importedRows,
      failedRows: errors.length,
      errors,
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

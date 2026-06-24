import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { del, put } from "@vercel/blob";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";

type UploadedFile = {
  buffer?: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
};

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly config: ConfigService,
  ) {}

  private async ensureOrganization() {
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    return this.prisma.tenant.upsert({ where: { slug }, create: { slug, name: "Default Organization" }, update: {} });
  }

  async list(folder?: string) {
    const org = await this.ensureOrganization();
    return this.prisma.storedFile.findMany({
      where: { tenantId: org.id, ...(folder ? { folder } : {}) },
      orderBy: { createdAt: "desc" },
    });
  }

  async upload(file: UploadedFile | undefined, folder?: string) {
    if (!file?.buffer) throw new BadRequestException("No file provided");
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) throw new BadRequestException("File storage is not configured");

    const org = await this.ensureOrganization();
    const safeName = (file.originalname || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `files/${org.id}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;
    const { url } = await put(key, file.buffer, {
      access: "public",
      token,
      contentType: file.mimetype || "application/octet-stream",
    });

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.storedFile.create({
        data: {
          tenantId: org.id,
          name: file.originalname || safeName,
          pathname: key,
          url,
          contentType: file.mimetype ?? null,
          sizeBytes: file.size ?? file.buffer!.length,
          folder: folder || null,
        },
      });
      await this.outbox.append(tx, {
        tenantId: org.id,
        eventType: "tenant.file.uploaded",
        aggregateId: row.id,
        payload: { fileId: row.id, tenantId: org.id, name: row.name },
      });
      return row;
    });
  }

  async remove(id: string) {
    const org = await this.ensureOrganization();
    const existing = await this.prisma.storedFile.findFirst({ where: { id, tenantId: org.id } });
    if (!existing) throw new NotFoundException("File not found");

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    // Best-effort blob delete; the row delete + event are the source of truth.
    if (token) {
      try {
        await del(existing.url, { token });
      } catch {
        /* blob already gone or transient — proceed to remove the row */
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.storedFile.delete({ where: { id } });
      await this.outbox.append(tx, {
        tenantId: org.id,
        eventType: "tenant.file.deleted",
        aggregateId: id,
        payload: { fileId: id, tenantId: org.id },
      });
      return { id };
    });
  }
}

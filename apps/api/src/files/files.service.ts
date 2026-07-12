import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { del } from "@vercel/blob";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { ImageUploadService } from "../common/storage/image-upload.service";

type UploadedFile = {
  buffer?: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
};

export type ListFilesOptions = {
  take?: number;
  skip?: number;
  folder?: string;
};

export type FileCategoryKey = "image" | "video" | "audio" | "document" | "other";

const CATEGORY_KEYS: FileCategoryKey[] = ["image", "video", "audio", "document", "other"];

/** Folder names: letters/numbers/spaces/dashes/underscores, max 64 chars. */
const FOLDER_NAME_RE = /^[A-Za-z0-9 _-]+$/;
const FOLDER_NAME_MAX = 64;

/** List-filter sentinel for "no folder" (folder IS NULL). Rejected as an
 *  actual folder name on upload so it can never collide with a real folder. */
export const UNFOLDERED_SENTINEL = "__none__";

/** Bucket a stored contentType into the summary category. */
export function categoriseContentType(contentType: string | null): FileCategoryKey {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("video/")) return "video";
  if (ct.startsWith("audio/")) return "audio";
  if (ct === "application/pdf" || ct === "application/msword" || ct.startsWith("application/vnd.") || ct.startsWith("text/")) {
    return "document";
  }
  return "other";
}

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly images: ImageUploadService,
  ) {}

  /** Trim + validate an optional folder name; empty/absent → null. */
  private normaliseFolder(folder?: string): string | null {
    if (folder === undefined || folder === null) return null;
    const trimmed = folder.trim();
    if (!trimmed) return null;
    if (trimmed.length > FOLDER_NAME_MAX) {
      throw new BadRequestException(`Folder name must be ${FOLDER_NAME_MAX} characters or fewer`);
    }
    if (!FOLDER_NAME_RE.test(trimmed)) {
      throw new BadRequestException("Folder name may only contain letters, numbers, spaces, dashes and underscores");
    }
    if (trimmed === UNFOLDERED_SENTINEL) {
      throw new BadRequestException("That folder name is reserved");
    }
    return trimmed;
  }

  async list(tenantId: string, opts: ListFilesOptions = {}) {
    const rawTake = Number(opts.take);
    const take = Number.isFinite(rawTake) ? Math.min(Math.max(Math.trunc(rawTake), 1), 100) : 50;
    const rawSkip = Number(opts.skip);
    const skip = Number.isFinite(rawSkip) ? Math.max(Math.trunc(rawSkip), 0) : 0;
    // The sentinel selects unfoldered files (folder IS NULL); normaliseFolder
    // rejects it as an actual folder name, so it can never collide.
    const folderWhere =
      opts.folder === UNFOLDERED_SENTINEL ? { folder: null } : opts.folder ? { folder: opts.folder } : {};
    const where = { tenantId, ...folderWhere };
    const [rows, total] = await Promise.all([
      this.prisma.storedFile.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }),
      this.prisma.storedFile.count({ where }),
    ]);
    return { rows, total };
  }

  async summary(tenantId: string) {
    const [byContentType, byFolder] = await Promise.all([
      this.prisma.storedFile.groupBy({
        by: ["contentType"],
        where: { tenantId },
        _count: { _all: true },
        _sum: { sizeBytes: true },
      }),
      this.prisma.storedFile.groupBy({
        by: ["folder"],
        where: { tenantId },
        _count: { _all: true },
        _sum: { sizeBytes: true },
      }),
    ]);

    const buckets = new Map<FileCategoryKey, { key: FileCategoryKey; count: number; bytes: number }>(
      CATEGORY_KEYS.map((key) => [key, { key, count: 0, bytes: 0 }]),
    );
    let totalCount = 0;
    let totalBytes = 0;
    for (const group of byContentType) {
      const bucket = buckets.get(categoriseContentType(group.contentType))!;
      const count = group._count._all;
      const bytes = group._sum.sizeBytes ?? 0;
      bucket.count += count;
      bucket.bytes += bytes;
      totalCount += count;
      totalBytes += bytes;
    }

    const folders = byFolder
      .map((group) => ({
        folder: group.folder ?? "Uncategorised",
        count: group._count._all,
        bytes: group._sum.sizeBytes ?? 0,
      }))
      .sort((a, b) => b.count - a.count || a.folder.localeCompare(b.folder));

    return {
      totalCount,
      totalBytes,
      categories: CATEGORY_KEYS.map((key) => buckets.get(key)!),
      folders,
    };
  }

  async upload(tenantId: string, file: UploadedFile | undefined, folder?: string) {
    if (!file?.buffer) throw new BadRequestException("No file provided");
    // Validate the folder before the blob put so a bad name fails fast without a stranded blob.
    const safeFolder = this.normaliseFolder(folder);
    const safeName = (file.originalname || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
    const { url, key } = await this.images.put(file.buffer, {
      key: `files/${tenantId}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`,
      contentType: file.mimetype || "application/octet-stream",
    });

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.storedFile.create({
        data: {
          tenantId,
          name: file.originalname || safeName,
          pathname: key,
          url,
          contentType: file.mimetype ?? null,
          sizeBytes: file.size ?? file.buffer!.length,
          folder: safeFolder,
        },
      });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "tenant.file.uploaded",
        aggregateId: row.id,
        payload: { fileId: row.id, tenantId, name: row.name },
      });
      return row;
    });
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.storedFile.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("File not found");

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    // Best-effort blob delete; the row delete + event are the source of truth. Credentials
    // resolve from the env (static token, or OIDC + BLOB_STORE_ID in the Vercel runtime).
    if (token || process.env.BLOB_STORE_ID) {
      try {
        await del(existing.url, token ? { token } : undefined);
      } catch {
        /* blob already gone or transient — proceed to remove the row */
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.storedFile.delete({ where: { id } });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "tenant.file.deleted",
        aggregateId: id,
        payload: { fileId: id, tenantId },
      });
      return { id };
    });
  }
}

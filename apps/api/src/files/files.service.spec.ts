import { BadRequestException } from "@nestjs/common";
import { put } from "@vercel/blob";
import { FilesService, categoriseContentType } from "./files.service";

jest.mock("@vercel/blob", () => ({
  put: jest.fn(async () => ({ url: "https://blob.example/dev/files/x" })),
  del: jest.fn(async () => undefined),
}));

function setup() {
  const prisma: any = {
    tenant: { upsert: jest.fn(async () => ({ id: "t1", slug: "default" })) },
    storedFile: {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      groupBy: jest.fn(async () => []),
      create: jest.fn(async ({ data }: any) => ({ id: "f1", ...data })),
      findFirst: jest.fn(),
      delete: jest.fn(async () => ({})),
    },
    $transaction: jest.fn(async (cb: any) => cb(prisma)),
  };
  const outbox = { append: jest.fn() } as any;
  const config = { get: jest.fn((_key: string, fallback?: unknown) => fallback) } as any;
  const svc = new FilesService(prisma, outbox, config);
  return { svc, prisma, outbox };
}

const pngUpload = { buffer: Buffer.from("png-bytes"), originalname: "logo.png", mimetype: "image/png", size: 9 };

describe("FilesService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
  });

  afterEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  describe("list", () => {
    it("defaults to take 50 / skip 0, newest first, and returns rows + total", async () => {
      const { svc, prisma } = setup();
      const rows = [{ id: "f1" }];
      prisma.storedFile.findMany.mockResolvedValue(rows);
      prisma.storedFile.count.mockResolvedValue(7);

      const result = await svc.list();

      expect(result).toEqual({ rows, total: 7 });
      expect(prisma.storedFile.findMany).toHaveBeenCalledWith({
        where: { tenantId: "t1" },
        orderBy: { createdAt: "desc" },
        take: 50,
        skip: 0,
      });
      expect(prisma.storedFile.count).toHaveBeenCalledWith({ where: { tenantId: "t1" } });
    });

    it("clamps take to 1–100 and skip to ≥0", async () => {
      const { svc, prisma } = setup();

      await svc.list({ take: 500, skip: -3 });
      expect(prisma.storedFile.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100, skip: 0 }));

      await svc.list({ take: 0, skip: 25 });
      expect(prisma.storedFile.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 1, skip: 25 }));

      await svc.list({ take: Number.NaN, skip: Number.NaN });
      expect(prisma.storedFile.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50, skip: 0 }));
    });

    it("filters rows AND total by folder when one is given", async () => {
      const { svc, prisma } = setup();

      await svc.list({ folder: "logos" });

      const where = { tenantId: "t1", folder: "logos" };
      expect(prisma.storedFile.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
      expect(prisma.storedFile.count).toHaveBeenCalledWith({ where });
    });

    it("maps the __none__ sentinel to folder IS NULL (unfoldered files)", async () => {
      const { svc, prisma } = setup();

      await svc.list({ folder: "__none__" });

      const where = { tenantId: "t1", folder: null };
      expect(prisma.storedFile.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
      expect(prisma.storedFile.count).toHaveBeenCalledWith({ where });
    });
  });

  describe("summary", () => {
    it("buckets contentTypes into categories and maps null folder to Uncategorised", async () => {
      const { svc, prisma } = setup();
      prisma.storedFile.groupBy
        .mockResolvedValueOnce([
          { contentType: "image/png", _count: { _all: 3 }, _sum: { sizeBytes: 300 } },
          { contentType: "image/jpeg", _count: { _all: 1 }, _sum: { sizeBytes: 50 } },
          { contentType: "video/mp4", _count: { _all: 1 }, _sum: { sizeBytes: 5000 } },
          { contentType: "audio/mpeg", _count: { _all: 2 }, _sum: { sizeBytes: 800 } },
          { contentType: "application/pdf", _count: { _all: 1 }, _sum: { sizeBytes: 90 } },
          { contentType: "application/vnd.ms-excel", _count: { _all: 1 }, _sum: { sizeBytes: 60 } },
          { contentType: "text/csv", _count: { _all: 1 }, _sum: { sizeBytes: 10 } },
          { contentType: "application/zip", _count: { _all: 1 }, _sum: { sizeBytes: 40 } },
          { contentType: null, _count: { _all: 1 }, _sum: { sizeBytes: null } },
        ])
        .mockResolvedValueOnce([
          { folder: "logos", _count: { _all: 4 }, _sum: { sizeBytes: 350 } },
          { folder: null, _count: { _all: 8 }, _sum: { sizeBytes: 6000 } },
        ]);

      const result = await svc.summary();

      expect(result.totalCount).toBe(12);
      expect(result.totalBytes).toBe(6350);
      expect(result.categories).toEqual([
        { key: "image", count: 4, bytes: 350 },
        { key: "video", count: 1, bytes: 5000 },
        { key: "audio", count: 2, bytes: 800 },
        { key: "document", count: 3, bytes: 160 },
        { key: "other", count: 2, bytes: 40 },
      ]);
      expect(result.folders).toEqual([
        { folder: "Uncategorised", count: 8, bytes: 6000 },
        { folder: "logos", count: 4, bytes: 350 },
      ]);
      // Both groupBys are tenant-scoped.
      for (const call of prisma.storedFile.groupBy.mock.calls) {
        expect(call[0].where).toEqual({ tenantId: "t1" });
      }
    });

    it("returns all five zeroed category buckets for an empty tenant", async () => {
      const { svc } = setup();

      const result = await svc.summary();

      expect(result).toEqual({
        totalCount: 0,
        totalBytes: 0,
        categories: [
          { key: "image", count: 0, bytes: 0 },
          { key: "video", count: 0, bytes: 0 },
          { key: "audio", count: 0, bytes: 0 },
          { key: "document", count: 0, bytes: 0 },
          { key: "other", count: 0, bytes: 0 },
        ],
        folders: [],
      });
    });
  });

  describe("categoriseContentType", () => {
    it("maps prefixes to the summary buckets", () => {
      expect(categoriseContentType("image/webp")).toBe("image");
      expect(categoriseContentType("video/quicktime")).toBe("video");
      expect(categoriseContentType("audio/ogg")).toBe("audio");
      expect(categoriseContentType("application/pdf")).toBe("document");
      expect(categoriseContentType("application/msword")).toBe("document");
      expect(categoriseContentType("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(
        "document",
      );
      expect(categoriseContentType("text/plain")).toBe("document");
      expect(categoriseContentType("application/octet-stream")).toBe("other");
      expect(categoriseContentType(null)).toBe("other");
    });
  });

  describe("upload folder handling", () => {
    it("stores a trimmed folder on the row and emits the uploaded event in the transaction", async () => {
      const { svc, prisma, outbox } = setup();

      const row = await svc.upload(pngUpload, "  Campaign Assets ");

      expect(prisma.storedFile.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: "t1", folder: "Campaign Assets" }) }),
      );
      expect(outbox.append).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "tenant.file.uploaded", aggregateId: row.id }),
      );
      expect(put).toHaveBeenCalled();
    });

    it("stores null when the folder is absent or blank", async () => {
      const { svc, prisma } = setup();

      await svc.upload(pngUpload);
      await svc.upload(pngUpload, "   ");

      for (const call of prisma.storedFile.create.mock.calls) {
        expect(call[0].data.folder).toBeNull();
      }
    });

    it("rejects a folder longer than 64 characters without touching blob storage", async () => {
      const { svc, prisma } = setup();

      await expect(svc.upload(pngUpload, "a".repeat(65))).rejects.toThrow(BadRequestException);
      expect(put).not.toHaveBeenCalled();
      expect(prisma.storedFile.create).not.toHaveBeenCalled();
    });

    it("rejects folder names with disallowed characters", async () => {
      const { svc } = setup();

      await expect(svc.upload(pngUpload, "bad/section")).rejects.toThrow(BadRequestException);
      await expect(svc.upload(pngUpload, "emoji 🎉")).rejects.toThrow(BadRequestException);
      await expect(svc.upload(pngUpload, "dots.are.out")).rejects.toThrow(BadRequestException);
      expect(put).not.toHaveBeenCalled();
    });

    it("accepts letters, numbers, spaces, dashes and underscores up to 64 chars", async () => {
      const { svc, prisma } = setup();

      await svc.upload(pngUpload, "My_Folder-2 v3");
      await svc.upload(pngUpload, "b".repeat(64));

      expect(prisma.storedFile.create.mock.calls[0][0].data.folder).toBe("My_Folder-2 v3");
      expect(prisma.storedFile.create.mock.calls[1][0].data.folder).toBe("b".repeat(64));
    });
  });
});

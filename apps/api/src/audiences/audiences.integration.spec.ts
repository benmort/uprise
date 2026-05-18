import { ConfigService } from "@nestjs/config";
import { AudiencesService } from "./audiences.service";
import { AudienceImportStatus } from "../../src/generated/prisma";

describe("AudiencesService integration-like flow", () => {
  it("starts csv import and resumes in bounded batches", async () => {
    const csvRaw = "name,phone,city\nAlice,+15551234567,Sydney\nBob,+15557654321,Melbourne";
    const job = {
      id: "import_1",
      audienceId: "aud_1",
      fileName: "contacts.csv",
      status: AudienceImportStatus.QUEUED,
      cursor: 0,
      totalRows: 2,
      importedRows: 0,
      failedRows: 0,
      errors: [],
      csvRaw,
      errorSummary: null,
      createdAt: new Date("2026-05-12T00:00:00.000Z"),
      startedAt: null as Date | null,
      completedAt: null as Date | null,
    };
    const prismaMock: any = {
      organization: {
        upsert: jest.fn().mockResolvedValue({ id: "org_1", slug: "default" }),
      },
      audience: {
        findFirst: jest.fn().mockResolvedValue({ id: "aud_1", organizationId: "org_1" }),
        update: jest.fn().mockResolvedValue({}),
      },
      audienceContact: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      audienceImport: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          Object.assign(job, data);
          return { id: job.id };
        }),
        findFirst: jest.fn().mockResolvedValue(job),
        update: jest.fn().mockImplementation(async ({ data }: any) => {
          Object.assign(job, data);
          return { ...job };
        }),
        findMany: jest.fn().mockResolvedValue([{ id: "import_1", audienceId: "aud_1" }]),
      },
    };
    const configMock = {
      get: (key: string, fallback?: string) => {
        if (key === "AUDIENCE_IMPORT_BATCH_SIZE") return "1";
        if (key === "AUDIENCE_IMPORT_DISPATCH_BATCH_SIZE") return "1";
        if (key === "AUDIENCE_IMPORT_MAX_RUN_MS") return "22000";
        return fallback ?? "default";
      },
    } as ConfigService;

    const service = new AudiencesService(prismaMock, configMock);
    const started = await service.startCsvImport(
      "aud_1",
      "contacts.csv",
      csvRaw,
    );

    expect(started.totalRows).toBe(2);
    expect(started.importedRows).toBe(1);
    expect(started.status).toBe(AudienceImportStatus.RUNNING);

    const resumed = await service.processImportBatch("import_1", 1);
    expect(resumed.status).toBe(AudienceImportStatus.SUCCEEDED);
    expect(resumed.cursor).toBe(2);
    expect(resumed.importedRows).toBe(2);
    expect(prismaMock.audienceContact.upsert).toHaveBeenCalledTimes(2);
    for (const [callArg] of prismaMock.audienceContact.upsert.mock.calls) {
      expect(callArg.create.metadata).toEqual(
        expect.objectContaining({
          contactable: true,
        }),
      );
      expect(callArg.update.metadata).toEqual(
        expect.objectContaining({
          contactable: true,
        }),
      );
    }
    expect(prismaMock.audience.update).toHaveBeenCalled();
  });

  it("dispatches pending imports in bounded batches", async () => {
    const csvRaw = "name,phone\nAlice,+15551234567";
    const job = {
      id: "import_2",
      audienceId: "aud_1",
      fileName: "contacts.csv",
      status: AudienceImportStatus.QUEUED,
      cursor: 0,
      totalRows: 1,
      importedRows: 0,
      failedRows: 0,
      errors: [],
      csvRaw,
      errorSummary: null,
      createdAt: new Date("2026-05-12T00:00:00.000Z"),
      startedAt: null as Date | null,
      completedAt: null as Date | null,
    };
    const prismaMock: any = {
      organization: {
        upsert: jest.fn().mockResolvedValue({ id: "org_1", slug: "default" }),
      },
      audience: {
        findFirst: jest.fn().mockResolvedValue({ id: "aud_1", organizationId: "org_1" }),
        update: jest.fn().mockResolvedValue({}),
      },
      audienceContact: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      audienceImport: {
        findMany: jest.fn().mockResolvedValue([{ id: "import_2", audienceId: "aud_1" }]),
        findFirst: jest.fn().mockResolvedValue(job),
        update: jest.fn().mockImplementation(async ({ data }: any) => {
          Object.assign(job, data);
          return { ...job };
        }),
      },
    };
    const configMock = {
      get: (key: string, fallback?: string) => {
        if (key === "AUDIENCE_IMPORT_DISPATCH_BATCH_SIZE") return "1";
        if (key === "AUDIENCE_IMPORT_MAX_RUN_MS") return "22000";
        return fallback ?? "default";
      },
    } as ConfigService;

    const service = new AudiencesService(prismaMock, configMock);
    const dispatched = await service.dispatchPendingImports(3);
    expect(dispatched.processed).toBe(1);
    expect(dispatched.results[0]).toEqual(
      expect.objectContaining({
        importId: "import_2",
        ok: true,
        status: AudienceImportStatus.SUCCEEDED,
      }),
    );
  });

  it("enqueues imports when BullMQ upload flag is enabled", async () => {
    const job = {
      id: "import_queued",
      audienceId: "aud_1",
      fileName: "contacts.csv",
      status: AudienceImportStatus.QUEUED,
      cursor: 0,
      totalRows: 1,
      importedRows: 0,
      failedRows: 0,
      errors: [],
      csvRaw: "name,phone\nAlice,+15551234567",
      errorSummary: null,
      createdAt: new Date("2026-05-12T00:00:00.000Z"),
      startedAt: null as Date | null,
      completedAt: null as Date | null,
    };
    const prismaMock: any = {
      organization: {
        upsert: jest.fn().mockResolvedValue({ id: "org_1", slug: "default" }),
      },
      audience: {
        findFirst: jest.fn().mockResolvedValue({ id: "aud_1", organizationId: "org_1" }),
      },
      audienceImport: {
        create: jest.fn().mockResolvedValue({ id: "import_queued" }),
        findFirst: jest.fn().mockResolvedValue(job),
        findMany: jest.fn().mockResolvedValue([{ id: "import_queued", audienceId: "aud_1" }]),
      },
    };
    const configMock = {
      get: (_key: string, fallback?: string) => fallback ?? "default",
    } as ConfigService;
    const flags = { isBullmqUploadEnabled: () => true } as any;
    const queue = { enqueue: jest.fn().mockResolvedValue({ jobId: "audience-import:import_queued", queued: true }) };

    const service = new AudiencesService(prismaMock, configMock, flags, queue as any);
    const started = await service.startCsvImport(
      "aud_1",
      "contacts.csv",
      "name,phone\nAlice,+15551234567",
    );
    expect(started.status).toBe(AudienceImportStatus.QUEUED);

    const dispatched = await service.dispatchPendingImports(1);
    expect(dispatched.results[0]).toEqual(
      expect.objectContaining({
        importId: "import_queued",
        ok: true,
        queued: true,
      }),
    );
    expect(queue.enqueue).toHaveBeenCalled();
  });
});

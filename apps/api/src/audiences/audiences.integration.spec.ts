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
});

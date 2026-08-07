import { AudienceImportStatus, AudienceSource } from "@uprise/db";
import { AudiencesService } from "./audiences.service";

/**
 * CSV import writes a chunk at a time: one batch contact resolution plus one
 * multi-row `INSERT … ON CONFLICT DO UPDATE`, with a row-at-a-time replay when the
 * set write fails so bad rows still name themselves. These pin the write shape, the
 * in-chunk dedupe, the fallback, and the cursor/progress bookkeeping — which must
 * come out exactly as the row-at-a-time version left it.
 */
function makeJob(csvRaw: string, over: Record<string, unknown> = {}) {
  return {
    id: "import_1",
    tenantId: "t1",
    audienceId: "aud1",
    fileName: "contacts.csv",
    status: AudienceImportStatus.QUEUED,
    cursor: 0,
    totalRows: 0,
    importedRows: 0,
    failedRows: 0,
    errors: [] as unknown,
    csvRaw,
    errorSummary: null as string | null,
    createdAt: new Date("2026-05-12T00:00:00.000Z"),
    startedAt: null as Date | null,
    completedAt: null as Date | null,
    ...over,
  };
}

function setup(csvRaw: string, jobOver: Record<string, unknown> = {}) {
  const job = makeJob(csvRaw, jobOver);
  const prisma: any = {
    audience: {
      findFirst: jest.fn(async () => ({ id: "aud1", tenantId: "t1" })),
      update: jest.fn(async () => ({})),
    },
    audienceContact: { upsert: jest.fn(async () => ({})) },
    audienceImport: {
      findFirst: jest.fn(async () => job),
      update: jest.fn(async ({ data }: any) => {
        Object.assign(job, data);
        return { ...job };
      }),
    },
    $executeRaw: jest.fn(async () => 1),
  };
  const config: any = {
    get: (key: string, fallback?: string) =>
      key === "AUDIENCE_IMPORT_MAX_RUN_MS" ? "22000" : (fallback ?? "default"),
  };
  const contacts: any = {
    getOrCreateManyByPhone: jest.fn(
      async (_t: string, seeds: Array<{ phoneE164: string }>) =>
        new Map(seeds.map((s) => [s.phoneE164, `contact_${s.phoneE164.slice(-2)}`])),
    ),
    getOrCreateByPhone: jest.fn(async (_t: string, phoneE164: string) => ({
      id: `contact_${phoneE164.slice(-2)}`,
    })),
  };
  const svc = new AudiencesService(prisma, config, undefined, undefined, contacts);
  return { svc, prisma, contacts, job };
}

/** The unnest arrays of the Nth $executeRaw, in the order the SQL binds them. */
function boundArrays(prisma: any, call = 0) {
  const [query] = prisma.$executeRaw.mock.calls[call];
  const [tenantId, audienceId, source, ids, phones, linked, names, metadata] = query.values;
  return { sql: query.sql, tenantId, audienceId, source, ids, phones, linked, names, metadata };
}

describe("AudiencesService — chunked CSV import", () => {
  it("writes a whole chunk with one contact resolution and one multi-row upsert", async () => {
    const { svc, prisma, contacts } = setup(
      "name,phone,city\nAlice,+15551234501,Sydney\nBob,+15551234502,Melbourne\nCarol,+15551234503,Perth",
    );

    const res = await svc.processImportBatch("import_1");

    expect(res.status).toBe(AudienceImportStatus.SUCCEEDED);
    expect(res.importedRows).toBe(3);
    expect(res.failedRows).toBe(0);
    expect(res.cursor).toBe(3);

    // Three rows, two queries — not six.
    expect(contacts.getOrCreateManyByPhone).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.audienceContact.upsert).not.toHaveBeenCalled();
    expect(contacts.getOrCreateByPhone).not.toHaveBeenCalled();

    const bound = boundArrays(prisma);
    expect(bound.sql).toContain(`INSERT INTO audience."AudienceContact"`);
    expect(bound.sql).toContain(`ON CONFLICT ("audienceId", "phoneE164") DO UPDATE`);
    expect(bound.sql).toContain("unnest(");
    expect(bound.tenantId).toBe("t1");
    expect(bound.audienceId).toBe("aud1");
    expect(bound.source).toBe(AudienceSource.CSV);
    expect(bound.phones).toEqual(["+15551234501", "+15551234502", "+15551234503"]);
    expect(bound.names).toEqual(["Alice", "Bob", "Carol"]);
    expect(bound.linked).toEqual(["contact_01", "contact_02", "contact_03"]);
    expect(bound.ids).toHaveLength(3);
    expect(new Set(bound.ids).size).toBe(3); // one fresh id per row
    expect(JSON.parse(bound.metadata[0])).toEqual(
      expect.objectContaining({ name: "Alice", city: "Sydney", contactable: true }),
    );
  });

  it("preserves an unset contact link on conflict rather than nulling it", async () => {
    const { svc, prisma } = setup("name,phone\nAlice,+15551234501");
    await svc.processImportBatch("import_1");
    expect(boundArrays(prisma).sql).toContain(
      `"contactId" = COALESCE(EXCLUDED."contactId", audience."AudienceContact"."contactId")`,
    );
  });

  it("collapses a phone repeated in the chunk to its last row, but counts both", async () => {
    const { svc, prisma, contacts } = setup(
      "name,phone\nOld Name,+15551234501\nNew Name,+15551234501\nBob,+15551234502",
    );

    const res = await svc.processImportBatch("import_1");

    // Both duplicate rows were processed, as the row-at-a-time path counted them.
    expect(res.importedRows).toBe(3);
    expect(res.cursor).toBe(3);
    // ...but only one write per distinct phone, carrying the LAST row's values.
    const bound = boundArrays(prisma);
    expect(bound.phones).toEqual(["+15551234501", "+15551234502"]);
    expect(bound.names).toEqual(["New Name", "Bob"]);
    expect(contacts.getOrCreateManyByPhone.mock.calls[0][1]).toHaveLength(2);
  });

  it("reports unusable rows by row number without attempting to write them", async () => {
    const { svc, prisma, job } = setup(
      "name,phone\nAlice,+15551234501\nNoPhone,\nBadPhone,0412 not-a-number\nBob,+15551234502",
    );

    const res = await svc.processImportBatch("import_1");

    expect(res.importedRows).toBe(2);
    expect(res.failedRows).toBe(2);
    expect(res.cursor).toBe(4);
    expect(job.errors).toEqual([
      { row: 2, message: "Missing phone" },
      // Unchanged from the row-at-a-time path: `String(error)` on the thrown
      // ApiHttpException, not its detail message.
      { row: 3, message: expect.stringContaining("ApiHttpException") },
    ]);
    expect(boundArrays(prisma).phones).toEqual(["+15551234501", "+15551234502"]);
  });

  it("skips the write entirely when a chunk has no usable rows", async () => {
    const { svc, prisma, contacts } = setup("name,phone\nNoPhone,\nAlsoNone,");

    const res = await svc.processImportBatch("import_1");

    expect(res.failedRows).toBe(2);
    expect(res.importedRows).toBe(0);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(contacts.getOrCreateManyByPhone).not.toHaveBeenCalled();
  });

  describe("row-at-a-time fallback", () => {
    it("replays the chunk when the set write fails, keeping per-row error detail", async () => {
      const { svc, prisma, contacts, job } = setup(
        "name,phone\nAlice,+15551234501\nBob,+15551234502\nCarol,+15551234503",
      );
      prisma.$executeRaw.mockRejectedValue(new Error("deadlock detected"));
      // The middle row is the poison one on replay.
      prisma.audienceContact.upsert.mockImplementation(async ({ create }: any) => {
        if (create.phoneE164 === "+15551234502") throw new Error("value too long for fullName");
        return {};
      });

      const res = await svc.processImportBatch("import_1");

      expect(res.status).toBe(AudienceImportStatus.SUCCEEDED);
      expect(res.importedRows).toBe(2);
      expect(res.failedRows).toBe(1);
      expect(res.cursor).toBe(3);
      // The bad row is named; the good ones still landed.
      expect(job.errors).toEqual([
        { row: 2, message: expect.stringContaining("value too long for fullName") },
      ]);
      expect(prisma.audienceContact.upsert).toHaveBeenCalledTimes(3);
      expect(contacts.getOrCreateByPhone).toHaveBeenCalledTimes(3);
    });

    it("replays every row of the chunk, duplicates included, not the deduped writes", async () => {
      const { svc, prisma } = setup("name,phone\nOld,+15551234501\nNew,+15551234501");
      prisma.$executeRaw.mockRejectedValue(new Error("nope"));

      const res = await svc.processImportBatch("import_1");

      expect(res.importedRows).toBe(2);
      expect(prisma.audienceContact.upsert).toHaveBeenCalledTimes(2);
      const names = prisma.audienceContact.upsert.mock.calls.map(([a]: any) => a.create.fullName);
      expect(names).toEqual(["Old", "New"]); // in order, so last still wins
    });

    it("counts a whole failed chunk as failed rows when every replayed row also fails", async () => {
      const { svc, prisma, job } = setup("name,phone\nAlice,+15551234501\nBob,+15551234502");
      prisma.$executeRaw.mockRejectedValue(new Error("connection reset"));
      prisma.audienceContact.upsert.mockRejectedValue(new Error("connection reset"));

      const res = await svc.processImportBatch("import_1");

      expect(res.importedRows).toBe(0);
      expect(res.failedRows).toBe(2);
      expect(res.status).toBe(AudienceImportStatus.SUCCEEDED);
      expect(res.errorSummary).toBe("Completed with 2 failed rows");
      expect(job.errors).toHaveLength(2);
    });

    it("keeps unusable-row errors alongside the replayed ones, in row order", async () => {
      const { svc, prisma, job } = setup("name,phone\nNoPhone,\nBob,+15551234502");
      prisma.$executeRaw.mockRejectedValue(new Error("boom"));
      prisma.audienceContact.upsert.mockRejectedValue(new Error("boom"));

      await svc.processImportBatch("import_1");

      expect(job.errors).toEqual([
        { row: 1, message: "Missing phone" },
        { row: 2, message: expect.stringContaining("boom") },
      ]);
    });
  });

  describe("cursor and progress semantics", () => {
    it("chunks are bounded by the batch size and resume from the stored cursor", async () => {
      const csv = ["name,phone", ...Array.from({ length: 5 }, (_, i) => `P${i},+1555123450${i}`)].join(
        "\n",
      );
      const { svc, prisma, job } = setup(csv);

      const first = await svc.processImportBatch("import_1", 2);
      expect(first.status).toBe(AudienceImportStatus.RUNNING);
      expect(first.cursor).toBe(2);
      expect(first.importedRows).toBe(2);
      expect(first.remainingRows).toBe(3);
      expect(boundArrays(prisma).phones).toEqual(["+15551234500", "+15551234501"]);

      const second = await svc.processImportBatch("import_1", 2);
      expect(second.cursor).toBe(4);
      expect(second.importedRows).toBe(4);
      expect(boundArrays(prisma, 1).phones).toEqual(["+15551234502", "+15551234503"]);

      const third = await svc.processImportBatch("import_1", 2);
      expect(third.status).toBe(AudienceImportStatus.SUCCEEDED);
      expect(third.cursor).toBe(5);
      expect(third.importedRows).toBe(5);
      expect(third.remainingRows).toBe(0);
      // Finishing stamps the audience as a CSV source.
      expect(prisma.audience.update).toHaveBeenCalled();
      expect(job.completedAt).toBeInstanceOf(Date);
    });

    it("caps a chunk at 500 rows", async () => {
      const csv = [
        "name,phone",
        ...Array.from({ length: 600 }, (_, i) => `P${i},+1555${String(i).padStart(7, "0")}`),
      ].join("\n");
      const { svc, prisma } = setup(csv);

      const res = await svc.processImportBatch("import_1", 600);

      expect(res.importedRows).toBe(600);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
      expect(boundArrays(prisma, 0).phones).toHaveLength(500);
      expect(boundArrays(prisma, 1).phones).toHaveLength(100);
    });

    it("row numbers stay absolute across resumed batches", async () => {
      const { svc, job } = setup("name,phone\nAlice,+15551234501\nNoPhone,", { cursor: 1 });
      await svc.processImportBatch("import_1");
      expect(job.errors).toEqual([{ row: 2, message: "Missing phone" }]);
    });

    it("adds deltas to the counts already banked by earlier batches", async () => {
      const { svc } = setup("name,phone\nAlice,+15551234501\nNoPhone,", {
        cursor: 0,
        importedRows: 40,
        failedRows: 7,
      });
      const res = await svc.processImportBatch("import_1");
      expect(res.importedRows).toBe(41);
      expect(res.failedRows).toBe(8);
    });

    it("writes nothing for a terminal job", async () => {
      const { svc, prisma } = setup("name,phone\nAlice,+15551234501", {
        status: AudienceImportStatus.SUCCEEDED,
      });
      const res = await svc.processImportBatch("import_1");
      expect(res.status).toBe(AudienceImportStatus.SUCCEEDED);
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });
  });

  it("still writes AudienceContacts when no ContactsService is wired", async () => {
    const job = makeJob("name,phone\nAlice,+15551234501");
    const prisma: any = {
      audience: { findFirst: jest.fn(async () => ({ id: "aud1" })), update: jest.fn(async () => ({})) },
      audienceContact: { upsert: jest.fn(async () => ({})) },
      audienceImport: {
        findFirst: jest.fn(async () => job),
        update: jest.fn(async ({ data }: any) => {
          Object.assign(job, data);
          return { ...job };
        }),
      },
      $executeRaw: jest.fn(async () => 1),
    };
    const config: any = { get: (_k: string, d?: string) => d ?? "default" };
    const svc = new AudiencesService(prisma, config);

    const res = await svc.processImportBatch("import_1");

    expect(res.importedRows).toBe(1);
    // No contact resolved, so the link binds as NULL and COALESCE keeps any existing one.
    expect(boundArrays(prisma).linked).toEqual([null]);
  });
});

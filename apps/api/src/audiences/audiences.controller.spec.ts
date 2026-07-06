import { BadRequestException } from "@nestjs/common";
import { AudiencesController } from "./audiences.controller";

describe("AudiencesController", () => {
  const audiences = {
    createAudience: jest.fn().mockResolvedValue({ id: "a1" }),
    listAudiences: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
    dispatchPendingImports: jest.fn().mockResolvedValue({ dispatched: 0 }),
    ensureWhatsappOptInAudience: jest.fn().mockResolvedValue({ id: "a1" }),
    getAudience: jest.fn().mockResolvedValue({ id: "a1" }),
    archiveAudience: jest.fn().mockResolvedValue({ id: "a1" }),
    restoreAudience: jest.fn().mockResolvedValue({ id: "a1" }),
    deleteAudience: jest.fn().mockResolvedValue(undefined),
    startCsvImport: jest.fn().mockResolvedValue({ importId: "i1" }),
    getImportStatus: jest.fn().mockResolvedValue({ status: "done" }),
    searchContacts: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
    listContacts: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
    exportContactsCsv: jest.fn().mockResolvedValue("id\n"),
    whatsappReach: jest.fn().mockResolvedValue({ reachable: 0 }),
    growthMetrics: jest.fn().mockResolvedValue({}),
    segmentationSummary: jest.fn().mockResolvedValue({}),
  } as any;
  const c = new AudiencesController(audiences);

  beforeEach(() => jest.clearAllMocks());

  it("create delegates with tenantId and dto", () => {
    const dto = { name: "supporters" } as any;
    c.create("t1", dto);
    expect(audiences.createAudience).toHaveBeenCalledWith("t1", dto);
  });

  it("list delegates with tenantId and dto", () => {
    const dto = {} as any;
    c.list("t1", dto);
    expect(audiences.listAudiences).toHaveBeenCalledWith("t1", dto);
  });

  it("dispatchImports parses the limit", () => {
    c.dispatchImports("5");
    expect(audiences.dispatchPendingImports).toHaveBeenCalledWith(5);
    c.dispatchImports();
    expect(audiences.dispatchPendingImports).toHaveBeenLastCalledWith(undefined);
  });

  it("whatsappOptIns delegates with tenantId", () => {
    c.whatsappOptIns("t1");
    expect(audiences.ensureWhatsappOptInAudience).toHaveBeenCalledWith("t1");
  });

  it("getOne delegates with tenantId and id", () => {
    c.getOne("t1", "a1");
    expect(audiences.getAudience).toHaveBeenCalledWith("t1", "a1");
  });

  it("archive delegates with tenantId and id", () => {
    c.archive("t1", "a1");
    expect(audiences.archiveAudience).toHaveBeenCalledWith("t1", "a1");
  });

  it("restore delegates with tenantId and id", () => {
    c.restore("t1", "a1");
    expect(audiences.restoreAudience).toHaveBeenCalledWith("t1", "a1");
  });

  it("remove delegates with tenantId and id", () => {
    c.remove("t1", "a1");
    expect(audiences.deleteAudience).toHaveBeenCalledWith("t1", "a1");
  });

  it("importCsv validates and delegates the decoded buffer", () => {
    const file = {
      buffer: Buffer.from("id\n1"),
      originalname: "contacts.csv",
      mimetype: "text/csv",
    } as any;
    c.importCsv("t1", "a1", file);
    expect(audiences.startCsvImport).toHaveBeenCalledWith("t1", "a1", "contacts.csv", "id\n1");
  });

  it("importCsv rejects a missing file", () => {
    expect(() => c.importCsv("t1", "a1", undefined as any)).toThrow(BadRequestException);
  });

  it("importCsv rejects a non-CSV file", () => {
    const file = { buffer: Buffer.from(""), originalname: "x.png", mimetype: "image/png" } as any;
    expect(() => c.importCsv("t1", "a1", file)).toThrow(BadRequestException);
  });

  it("importStatus delegates with tenantId, id and importId", () => {
    c.importStatus("t1", "a1", "i1");
    expect(audiences.getImportStatus).toHaveBeenCalledWith("t1", "a1", "i1");
  });

  it("contacts searches when a query is present", () => {
    c.contacts("t1", "a1", { query: "  jane ", limit: 10, offset: 0 } as any);
    expect(audiences.searchContacts).toHaveBeenCalledWith("t1", "a1", "  jane ", 10, 0);
  });

  it("contacts lists when no query is present", () => {
    c.contacts("t1", "a1", { limit: 10, offset: 0 } as any);
    expect(audiences.listContacts).toHaveBeenCalledWith("t1", "a1", 10, 0);
  });

  it("exportCsv delegates with tenantId and id", async () => {
    await c.exportCsv("t1", "a1");
    expect(audiences.exportContactsCsv).toHaveBeenCalledWith("t1", "a1");
  });

  it("whatsappReach delegates with tenantId and id", () => {
    c.whatsappReach("t1", "a1");
    expect(audiences.whatsappReach).toHaveBeenCalledWith("t1", "a1");
  });

  it("growth delegates with tenantId and id", () => {
    c.growth("t1", "a1");
    expect(audiences.growthMetrics).toHaveBeenCalledWith("t1", "a1");
  });

  it("summary delegates with tenantId and id", () => {
    c.summary("t1", "a1");
    expect(audiences.segmentationSummary).toHaveBeenCalledWith("t1", "a1");
  });
});

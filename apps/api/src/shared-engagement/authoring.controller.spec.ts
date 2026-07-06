import { AuthoringController } from "./authoring.controller";

describe("AuthoringController", () => {
  const surveys = {
    list: jest.fn().mockResolvedValue([]),
    get: jest.fn().mockResolvedValue({ id: "s1" }),
    create: jest.fn().mockResolvedValue({ id: "s1" }),
    update: jest.fn().mockResolvedValue({ id: "s1" }),
    archive: jest.fn().mockResolvedValue(undefined),
  } as any;
  const scripts = {
    list: jest.fn().mockResolvedValue([]),
    get: jest.fn().mockResolvedValue({ id: "sc1" }),
    create: jest.fn().mockResolvedValue({ id: "sc1" }),
    update: jest.fn().mockResolvedValue({ id: "sc1" }),
    archive: jest.fn().mockResolvedValue(undefined),
  } as any;
  const c = new AuthoringController(surveys, scripts);

  beforeEach(() => jest.clearAllMocks());

  it("listSurveys delegates with tenantId", async () => {
    await c.listSurveys("t1");
    expect(surveys.list).toHaveBeenCalledWith("t1");
  });

  it("getSurvey delegates with tenantId + id", async () => {
    await c.getSurvey("t1", "s1");
    expect(surveys.get).toHaveBeenCalledWith("t1", "s1");
  });

  it("createSurvey delegates with tenantId + dto", async () => {
    const dto = { name: "Q3" } as any;
    await c.createSurvey("t1", dto);
    expect(surveys.create).toHaveBeenCalledWith("t1", dto);
  });

  it("updateSurvey delegates with tenantId, id + dto", async () => {
    const dto = { name: "Q4" } as any;
    await c.updateSurvey("t1", "s1", dto);
    expect(surveys.update).toHaveBeenCalledWith("t1", "s1", dto);
  });

  it("deleteSurvey delegates with tenantId + id", async () => {
    await c.deleteSurvey("t1", "s1");
    expect(surveys.archive).toHaveBeenCalledWith("t1", "s1");
  });

  it("listScripts delegates with tenantId", async () => {
    await c.listScripts("t1");
    expect(scripts.list).toHaveBeenCalledWith("t1");
  });

  it("getScript delegates with tenantId + id", async () => {
    await c.getScript("t1", "sc1");
    expect(scripts.get).toHaveBeenCalledWith("t1", "sc1");
  });

  it("createScript delegates with tenantId + dto", async () => {
    const dto = { name: "Door script" } as any;
    await c.createScript("t1", dto);
    expect(scripts.create).toHaveBeenCalledWith("t1", dto);
  });

  it("updateScript delegates with tenantId, id + dto", async () => {
    const dto = { name: "Phone script" } as any;
    await c.updateScript("t1", "sc1", dto);
    expect(scripts.update).toHaveBeenCalledWith("t1", "sc1", dto);
  });

  it("deleteScript delegates with tenantId + id", async () => {
    await c.deleteScript("t1", "sc1");
    expect(scripts.archive).toHaveBeenCalledWith("t1", "sc1");
  });
});

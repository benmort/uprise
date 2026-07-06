import { EngagementChannel } from "@uprise/db";
import { EngagementController } from "./engagement.controller";

describe("EngagementController", () => {
  const engagement = {
    listDispositionDefs: jest.fn().mockResolvedValue([]),
    recordDisposition: jest.fn().mockResolvedValue({ id: "d1" }),
    createDispositionDef: jest.fn().mockResolvedValue({ id: "dd1" }),
    updateDispositionDef: jest.fn().mockResolvedValue({ id: "dd1" }),
    deleteDispositionDef: jest.fn().mockResolvedValue(undefined),
    recordSurveyAnswer: jest.fn().mockResolvedValue({ id: "sa1" }),
    useCannedResponse: jest.fn().mockResolvedValue({ body: "hi" }),
  } as any;
  const canned = {
    listForChannel: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: "cr1" }),
    update: jest.fn().mockResolvedValue({ id: "cr1" }),
    archive: jest.fn().mockResolvedValue(undefined),
  } as any;
  const c = new EngagementController(engagement, canned);

  beforeEach(() => jest.clearAllMocks());

  it("listDispositions delegates with tenantId + channel", async () => {
    await c.listDispositions("t1", EngagementChannel.SMS);
    expect(engagement.listDispositionDefs).toHaveBeenCalledWith("t1", EngagementChannel.SMS);
  });

  it("recordDisposition delegates with tenantId + dto", async () => {
    const dto = { contactId: "c1" } as any;
    await c.recordDisposition("t1", dto);
    expect(engagement.recordDisposition).toHaveBeenCalledWith("t1", dto);
  });

  it("createDispositionDef delegates with tenantId + dto", async () => {
    const dto = { label: "No answer" } as any;
    await c.createDispositionDef("t1", dto);
    expect(engagement.createDispositionDef).toHaveBeenCalledWith("t1", dto);
  });

  it("updateDispositionDef delegates with tenantId, id + dto", async () => {
    const dto = { label: "Renamed" } as any;
    await c.updateDispositionDef("t1", "dd1", dto);
    expect(engagement.updateDispositionDef).toHaveBeenCalledWith("t1", "dd1", dto);
  });

  it("deleteDispositionDef delegates with tenantId + id", async () => {
    await c.deleteDispositionDef("t1", "dd1");
    expect(engagement.deleteDispositionDef).toHaveBeenCalledWith("t1", "dd1");
  });

  it("recordSurveyAnswer delegates with tenantId + dto", async () => {
    const dto = { surveyId: "s1" } as any;
    await c.recordSurveyAnswer("t1", dto);
    expect(engagement.recordSurveyAnswer).toHaveBeenCalledWith("t1", dto);
  });

  it("listCanned delegates with tenantId, channel + ownerId", async () => {
    await c.listCanned("t1", EngagementChannel.DOOR, "u1");
    expect(canned.listForChannel).toHaveBeenCalledWith("t1", EngagementChannel.DOOR, "u1");
  });

  it("listCanned defaults channel to SMS", async () => {
    await c.listCanned("t1");
    expect(canned.listForChannel).toHaveBeenCalledWith("t1", EngagementChannel.SMS, undefined);
  });

  it("createCanned delegates with tenantId + dto", async () => {
    const dto = { body: "hi" } as any;
    await c.createCanned("t1", dto);
    expect(canned.create).toHaveBeenCalledWith("t1", dto);
  });

  it("updateCanned delegates with tenantId, id + dto", async () => {
    const dto = { body: "hi" } as any;
    await c.updateCanned("t1", "cr1", dto);
    expect(canned.update).toHaveBeenCalledWith("t1", "cr1", dto);
  });

  it("deleteCanned delegates with tenantId + id", async () => {
    await c.deleteCanned("t1", "cr1");
    expect(canned.archive).toHaveBeenCalledWith("t1", "cr1");
  });

  it("useCanned delegates with tenantId + mapped payload", async () => {
    await c.useCanned("t1", {
      cannedResponseId: "cr1",
      contactId: "c1",
      channel: EngagementChannel.DOOR,
    } as any);
    expect(engagement.useCannedResponse).toHaveBeenCalledWith("t1", {
      cannedResponseId: "cr1",
      contactId: "c1",
      channel: EngagementChannel.DOOR,
    });
  });

  it("useCanned defaults channel to SMS", async () => {
    await c.useCanned("t1", { cannedResponseId: "cr1", contactId: "c1" } as any);
    expect(engagement.useCannedResponse).toHaveBeenCalledWith("t1", {
      cannedResponseId: "cr1",
      contactId: "c1",
      channel: EngagementChannel.SMS,
    });
  });
});

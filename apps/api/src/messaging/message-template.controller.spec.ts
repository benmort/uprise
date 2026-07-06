import { MessageTemplateController } from "./message-template.controller";

describe("MessageTemplateController", () => {
  const templates = {
    create: jest.fn().mockResolvedValue({}),
    list: jest.fn().mockResolvedValue([]),
    get: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  } as any;
  const c = new MessageTemplateController(templates);

  beforeEach(() => jest.clearAllMocks());

  it("create delegates with tenantId + dto", () => {
    const dto = { name: "t" } as any;
    c.create("t1", dto);
    expect(templates.create).toHaveBeenCalledWith("t1", dto);
  });

  it("list delegates with tenantId", () => {
    c.list("t1");
    expect(templates.list).toHaveBeenCalledWith("t1");
  });

  it("get delegates with tenantId + id", () => {
    c.get("t1", "id1");
    expect(templates.get).toHaveBeenCalledWith("t1", "id1");
  });

  it("update delegates with tenantId, id + dto", () => {
    const dto = { name: "u" } as any;
    c.update("t1", "id1", dto);
    expect(templates.update).toHaveBeenCalledWith("t1", "id1", dto);
  });
});

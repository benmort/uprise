import { WhatsappController } from "./whatsapp.controller";

describe("WhatsappController", () => {
  const whatsapp = {
    listTemplates: jest.fn().mockResolvedValue([]),
    syncTemplates: jest.fn().mockResolvedValue({ synced: 0 }),
  } as any;
  const c = new WhatsappController(whatsapp);

  beforeEach(() => jest.clearAllMocks());

  it("listTemplates delegates with tenantId + status filter", () => {
    c.listTemplates("t1", "APPROVED");
    expect(whatsapp.listTemplates).toHaveBeenCalledWith("t1", { status: "APPROVED" });
  });

  it("listTemplates passes undefined status when omitted", () => {
    c.listTemplates("t1");
    expect(whatsapp.listTemplates).toHaveBeenCalledWith("t1", { status: undefined });
  });

  it("syncTemplates delegates with tenantId", () => {
    c.syncTemplates("t1");
    expect(whatsapp.syncTemplates).toHaveBeenCalledWith("t1");
  });
});

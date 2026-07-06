import { OrgProfileController } from "./org-profile.controller";

describe("OrgProfileController", () => {
  const orgProfile = {
    getProfile: jest.fn().mockResolvedValue({}),
    updateProfile: jest.fn().mockResolvedValue({}),
    setCredential: jest.fn().mockResolvedValue({}),
    addContact: jest.fn().mockResolvedValue({}),
    updateContact: jest.fn().mockResolvedValue({}),
    deleteContact: jest.fn().mockResolvedValue({}),
    addAddress: jest.fn().mockResolvedValue({}),
    updateAddress: jest.fn().mockResolvedValue({}),
    deleteAddress: jest.fn().mockResolvedValue({}),
  } as any;
  const c = new OrgProfileController(orgProfile);

  beforeEach(() => jest.clearAllMocks());

  it("get delegates with tenantId", () => {
    c.get("t1");
    expect(orgProfile.getProfile).toHaveBeenCalledWith("t1");
  });

  it("update delegates with tenantId + dto", () => {
    const dto = { legalName: "Org" } as any;
    c.update("t1", dto);
    expect(orgProfile.updateProfile).toHaveBeenCalledWith("t1", dto);
  });

  it("setCredential delegates with tenantId + dto", () => {
    const dto = { kind: "abn", value: "123" } as any;
    c.setCredential("t1", dto);
    expect(orgProfile.setCredential).toHaveBeenCalledWith("t1", dto);
  });

  it("addContact delegates with tenantId + dto", () => {
    const dto = { name: "c" } as any;
    c.addContact("t1", dto);
    expect(orgProfile.addContact).toHaveBeenCalledWith("t1", dto);
  });

  it("updateContact delegates with tenantId, id + dto", () => {
    const dto = { name: "c" } as any;
    c.updateContact("t1", "id1", dto);
    expect(orgProfile.updateContact).toHaveBeenCalledWith("t1", "id1", dto);
  });

  it("deleteContact delegates with tenantId + id", () => {
    c.deleteContact("t1", "id1");
    expect(orgProfile.deleteContact).toHaveBeenCalledWith("t1", "id1");
  });

  it("addAddress delegates with tenantId + dto", () => {
    const dto = { line1: "1 St" } as any;
    c.addAddress("t1", dto);
    expect(orgProfile.addAddress).toHaveBeenCalledWith("t1", dto);
  });

  it("updateAddress delegates with tenantId, id + dto", () => {
    const dto = { line1: "1 St" } as any;
    c.updateAddress("t1", "id1", dto);
    expect(orgProfile.updateAddress).toHaveBeenCalledWith("t1", "id1", dto);
  });

  it("deleteAddress delegates with tenantId + id", () => {
    c.deleteAddress("t1", "id1");
    expect(orgProfile.deleteAddress).toHaveBeenCalledWith("t1", "id1");
  });
});

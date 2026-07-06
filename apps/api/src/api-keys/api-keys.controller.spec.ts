import { ApiKeysController } from "./api-keys.controller";

describe("ApiKeysController", () => {
  const apiKeys = {
    list: jest.fn().mockResolvedValue([]),
    issue: jest.fn().mockResolvedValue({ id: "k1" }),
    revoke: jest.fn().mockResolvedValue(undefined),
  } as any;
  const c = new ApiKeysController(apiKeys);

  beforeEach(() => jest.clearAllMocks());

  it("list delegates with tenantId", () => {
    c.list("t1");
    expect(apiKeys.list).toHaveBeenCalledWith("t1");
  });

  it("issue delegates with tenantId and dto", () => {
    const dto = { name: "ci" } as any;
    c.issue("t1", dto);
    expect(apiKeys.issue).toHaveBeenCalledWith("t1", dto);
  });

  it("revoke delegates with tenantId and id", () => {
    c.revoke("t1", "k1");
    expect(apiKeys.revoke).toHaveBeenCalledWith("t1", "k1");
  });
});

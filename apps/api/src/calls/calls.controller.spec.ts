import { CallsController } from "./calls.controller";

describe("CallsController", () => {
  const calls = {
    initiate: jest.fn().mockResolvedValue({ id: "c1" }),
    listCalls: jest.fn().mockResolvedValue([]),
    getCall: jest.fn().mockResolvedValue({ id: "c1" }),
  } as any;
  const c = new CallsController(calls);

  beforeEach(() => jest.clearAllMocks());

  it("initiate delegates with tenantId and dto", () => {
    const dto = { to: "+61400000000" } as any;
    c.initiate("t1", dto);
    expect(calls.initiate).toHaveBeenCalledWith("t1", dto);
  });

  it("list parses the limit and delegates with tenantId", () => {
    c.list("t1", "10");
    expect(calls.listCalls).toHaveBeenCalledWith("t1", 10);
    c.list("t1");
    expect(calls.listCalls).toHaveBeenLastCalledWith("t1", undefined);
  });

  it("get delegates with tenantId and id", () => {
    c.get("t1", "c1");
    expect(calls.getCall).toHaveBeenCalledWith("t1", "c1");
  });
});

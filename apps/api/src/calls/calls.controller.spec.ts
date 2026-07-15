import { CallStatus } from "@uprise/db";
import { CallsController } from "./calls.controller";

describe("CallsController", () => {
  const calls = {
    initiate: jest.fn().mockResolvedValue({ id: "c1" }),
    listCalls: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    stats: jest.fn().mockResolvedValue({ total: 0, byStatus: {}, totalDurationSeconds: 0 }),
    getCall: jest.fn().mockResolvedValue({ id: "c1" }),
    streamRecording: jest.fn().mockResolvedValue({ contentType: "audio/mpeg", body: Buffer.from("x") }),
    voiceToken: jest.fn().mockResolvedValue({ token: "jwt", identity: "uu1.tt1", fromNumber: "+61400000111", expiresAt: "z" }),
  } as any;
  const c = new CallsController(calls);

  beforeEach(() => jest.clearAllMocks());

  it("initiate delegates with tenantId and dto", () => {
    const dto = { toNumber: "+61400000000" } as any;
    c.initiate("t1", dto);
    expect(calls.initiate).toHaveBeenCalledWith("t1", dto);
  });

  it("list delegates the filter dto with tenantId", () => {
    const dto = { status: [CallStatus.COMPLETED], limit: 10, offset: 0 } as any;
    c.list("t1", dto);
    expect(calls.listCalls).toHaveBeenCalledWith("t1", dto);
  });

  it("stats delegates the filter dto with tenantId", () => {
    const dto = { status: [CallStatus.COMPLETED] } as any;
    c.stats("t1", dto);
    expect(calls.stats).toHaveBeenCalledWith("t1", dto);
  });

  it("voiceToken delegates with the session user id + tenant", () => {
    c.voiceToken("t1", { user: { id: "u1" } } as any);
    expect(calls.voiceToken).toHaveBeenCalledWith("u1", "t1");
  });

  it("recording streams the proxied audio with the right content type", async () => {
    const res = { setHeader: jest.fn(), send: jest.fn() } as any;
    await c.recording("t1", "c1", res);
    expect(calls.streamRecording).toHaveBeenCalledWith("t1", "c1");
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "audio/mpeg");
    expect(res.send).toHaveBeenCalledWith(expect.any(Buffer));
  });

  it("get delegates with tenantId and id", () => {
    c.get("t1", "c1");
    expect(calls.getCall).toHaveBeenCalledWith("t1", "c1");
  });
});

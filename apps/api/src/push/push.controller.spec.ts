import { PushController } from "./push.controller";

describe("PushController", () => {
  const push = {
    isEnabled: jest.fn().mockReturnValue(true),
    subscribe: jest.fn().mockResolvedValue(undefined),
    broadcast: jest.fn().mockResolvedValue({ sent: 0 }),
  } as any;
  const config = { get: jest.fn().mockReturnValue("pk") } as any;
  const c = new PushController(config, push);

  beforeEach(() => jest.clearAllMocks());

  it("config2 exposes the enabled flag + VAPID public key", () => {
    push.isEnabled.mockReturnValueOnce(true);
    config.get.mockReturnValueOnce("pk");
    expect(c.config2()).toEqual({ enabled: true, publicKey: "pk" });
    expect(config.get).toHaveBeenCalledWith("VAPID_PUBLIC_KEY", "");
  });

  it("config2 nulls an empty public key", () => {
    push.isEnabled.mockReturnValueOnce(false);
    config.get.mockReturnValueOnce("");
    expect(c.config2()).toEqual({ enabled: false, publicKey: null });
  });

  it("subscribe registers the caller's device with their user id", async () => {
    const sub = { endpoint: "e", keys: { p256dh: "p", auth: "a" } } as any;
    await expect(c.subscribe("t1", sub, { user: { id: "u1" } } as any)).resolves.toEqual({ ok: true });
    expect(push.subscribe).toHaveBeenCalledWith("t1", "u1", sub);
  });

  it("subscribe passes a null owner when unauthenticated", async () => {
    const sub = { endpoint: "e" } as any;
    await c.subscribe("t1", sub, {} as any);
    expect(push.subscribe).toHaveBeenCalledWith("t1", null, sub);
  });

  it("broadcast forwards title/body/url with defaults applied", async () => {
    await c.broadcast("t1", { title: "", body: "", url: "https://x" } as any);
    expect(push.broadcast).toHaveBeenCalledWith("t1", {
      title: "Uprise",
      body: "",
      url: "https://x",
    });
  });
});

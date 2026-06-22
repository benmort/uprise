import { ConfigService } from "@nestjs/config";
import { PushService } from "./push.service";

describe("PushService", () => {
  let prisma: any;
  function make(flags: Record<string, unknown>) {
    const config = {
      get: (key: string, fallback?: unknown) => (key in flags ? flags[key] : fallback),
    } as unknown as ConfigService;
    return new PushService(config, prisma);
  }

  beforeEach(() => {
    prisma = {
      pushSubscription: {
        upsert: jest.fn().mockResolvedValue({ id: "ps1" }),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
  });

  it("is disabled without keys (broadcast no-ops cleanly)", async () => {
    const svc = make({ FEATURE_PUSH_ENABLED: true }); // no VAPID keys
    expect(svc.isEnabled()).toBe(false);
    const res = await svc.broadcast("org1", { title: "Hi", body: "there" });
    expect(res).toEqual({ sent: 0, pruned: 0, enabled: false });
    expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled();
  });

  it("upserts a subscription keyed by (org, endpoint)", async () => {
    const svc = make({});
    await svc.subscribe("org1", "u1", {
      endpoint: "https://push.example/abc",
      keys: { p256dh: "p", auth: "a" },
      userAgent: "ua",
    });
    expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_endpoint: { tenantId: "org1", endpoint: "https://push.example/abc" } },
      }),
    );
  });
});

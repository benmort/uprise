import { MessageChannel } from "@uprise/db";
import { SessionWindowService } from "./session-window.service";

function makePrisma(overrides: Record<string, any> = {}) {
  const base: any = {
    inboundMessage: { findFirst: jest.fn().mockResolvedValue(null) },
    ...overrides,
  };
  return base;
}

// ConfigService stub: returns the configured value for the window-hours key,
// falling back to the caller's default otherwise.
function makeConfig(hours?: string) {
  return { get: (_key: string, def?: any) => hours ?? def } as any;
}

const HOURS = 60 * 60 * 1000;

describe("SessionWindowService", () => {
  let prisma: any;

  beforeEach(() => {
    prisma = makePrisma();
  });

  describe("lastInboundAt", () => {
    it("returns the most recent inbound WhatsApp timestamp", async () => {
      const when = new Date("2026-01-01T00:00:00Z");
      prisma.inboundMessage.findFirst.mockResolvedValue({ receivedAt: when });
      const service = new SessionWindowService(prisma, makeConfig());
      expect(await service.lastInboundAt("t1", "+61400000000")).toBe(when);
      expect(prisma.inboundMessage.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: "t1", fromPhone: "+61400000000", channel: MessageChannel.WHATSAPP },
          orderBy: { receivedAt: "desc" },
        }),
      );
    });

    it("returns null when the contact has never messaged in", async () => {
      prisma.inboundMessage.findFirst.mockResolvedValue(null);
      const service = new SessionWindowService(prisma, makeConfig());
      expect(await service.lastInboundAt("t1", "+61400000000")).toBeNull();
    });
  });

  describe("isOpen", () => {
    it("is always open for non-WhatsApp channels (no query needed)", async () => {
      const service = new SessionWindowService(prisma, makeConfig());
      expect(await service.isOpen("t1", "+61400000000", MessageChannel.SMS)).toBe(true);
      expect(prisma.inboundMessage.findFirst).not.toHaveBeenCalled();
    });

    it("is closed when there is no inbound message", async () => {
      prisma.inboundMessage.findFirst.mockResolvedValue(null);
      const service = new SessionWindowService(prisma, makeConfig());
      expect(await service.isOpen("t1", "+61400000000", MessageChannel.WHATSAPP)).toBe(false);
    });

    it("is open within the 24h default window and closed beyond it", async () => {
      const service = new SessionWindowService(prisma, makeConfig());

      prisma.inboundMessage.findFirst.mockResolvedValue({ receivedAt: new Date(Date.now() - 1 * HOURS) });
      expect(await service.isOpen("t1", "+61400000000", MessageChannel.WHATSAPP)).toBe(true);

      prisma.inboundMessage.findFirst.mockResolvedValue({ receivedAt: new Date(Date.now() - 25 * HOURS) });
      expect(await service.isOpen("t1", "+61400000000", MessageChannel.WHATSAPP)).toBe(false);
    });

    it("honours a configured window, clamped to a 1-hour floor", async () => {
      const service = new SessionWindowService(prisma, makeConfig("1"));

      prisma.inboundMessage.findFirst.mockResolvedValue({ receivedAt: new Date(Date.now() - 0.5 * HOURS) });
      expect(await service.isOpen("t1", "+61400000000", MessageChannel.WHATSAPP)).toBe(true);

      prisma.inboundMessage.findFirst.mockResolvedValue({ receivedAt: new Date(Date.now() - 2 * HOURS) });
      expect(await service.isOpen("t1", "+61400000000", MessageChannel.WHATSAPP)).toBe(false);
    });

    it("clamps an over-large configured window to 24 hours", async () => {
      const service = new SessionWindowService(prisma, makeConfig("100"));
      prisma.inboundMessage.findFirst.mockResolvedValue({ receivedAt: new Date(Date.now() - 30 * HOURS) });
      expect(await service.isOpen("t1", "+61400000000", MessageChannel.WHATSAPP)).toBe(false);
    });
  });
});

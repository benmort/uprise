import { ConsentState, MessageChannel } from "@uprise/db";
import { ConsentService, classifyConsentKeyword } from "./consent.service";

function makePrisma(overrides: Record<string, any> = {}) {
  const base: any = {
    contactConsent: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
    },
    ...overrides,
  };
  return base;
}

describe("classifyConsentKeyword", () => {
  it("maps stop keywords to OPTED_OUT (case/space-insensitive)", () => {
    for (const w of ["STOP", " stop ", "unsubscribe", "cancel", "quit", "stop all"]) {
      expect(classifyConsentKeyword(w)).toBe(ConsentState.OPTED_OUT);
    }
  });

  it("maps start keywords to OPTED_IN", () => {
    for (const w of ["start", "YES", "unstop", "resume"]) {
      expect(classifyConsentKeyword(w)).toBe(ConsentState.OPTED_IN);
    }
  });

  it("returns null for empty or ordinary messages", () => {
    expect(classifyConsentKeyword("")).toBeNull();
    expect(classifyConsentKeyword("   ")).toBeNull();
    expect(classifyConsentKeyword("hello there")).toBeNull();
    expect(classifyConsentKeyword(undefined as any)).toBeNull();
  });
});

describe("ConsentService", () => {
  let prisma: any;
  let service: ConsentService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ConsentService(prisma);
  });

  describe("getState", () => {
    it("returns the stored state", async () => {
      prisma.contactConsent.findUnique.mockResolvedValue({ state: ConsentState.OPTED_OUT });
      const state = await service.getState("t1", "+61400000000", MessageChannel.SMS);
      expect(state).toBe(ConsentState.OPTED_OUT);
      expect(prisma.contactConsent.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId_phoneE164_channel: {
              tenantId: "t1",
              phoneE164: "+61400000000",
              channel: MessageChannel.SMS,
            },
          },
        }),
      );
    });

    it("defaults to UNKNOWN when there is no row", async () => {
      prisma.contactConsent.findUnique.mockResolvedValue(null);
      expect(await service.getState("t1", "+61400000000", MessageChannel.WHATSAPP)).toBe(
        ConsentState.UNKNOWN,
      );
    });
  });

  describe("setState", () => {
    it("upserts with contactId and source when supplied", async () => {
      await service.setState({
        tenantId: "t1",
        phoneE164: "+61400000000",
        channel: MessageChannel.SMS,
        state: ConsentState.OPTED_IN,
        contactId: "c1",
        source: "keyword",
      });
      const call = prisma.contactConsent.upsert.mock.calls[0][0];
      expect(call.where.tenantId_phoneE164_channel.tenantId).toBe("t1");
      expect(call.update).toMatchObject({ state: ConsentState.OPTED_IN, contactId: "c1", source: "keyword" });
      expect(call.create).toMatchObject({ contactId: "c1", source: "keyword" });
    });

    it("omits contactId/source from the update, and nulls them on create, when absent", async () => {
      await service.setState({
        tenantId: "t1",
        phoneE164: "+61400000000",
        channel: MessageChannel.SMS,
        state: ConsentState.OPTED_OUT,
      });
      const call = prisma.contactConsent.upsert.mock.calls[0][0];
      expect(call.update).toEqual({ state: ConsentState.OPTED_OUT });
      expect(call.create).toMatchObject({ contactId: null, source: null });
    });
  });

  describe("canSend", () => {
    it("blocks a hard opt-out on any channel", () => {
      expect(service.canSend(ConsentState.OPTED_OUT, MessageChannel.SMS)).toBe(false);
      expect(service.canSend(ConsentState.OPTED_OUT, MessageChannel.WHATSAPP)).toBe(false);
    });

    it("requires explicit opt-in for WhatsApp", () => {
      expect(service.canSend(ConsentState.OPTED_IN, MessageChannel.WHATSAPP)).toBe(true);
      expect(service.canSend(ConsentState.UNKNOWN, MessageChannel.WHATSAPP)).toBe(false);
    });

    it("allows SMS unless opted out", () => {
      expect(service.canSend(ConsentState.UNKNOWN, MessageChannel.SMS)).toBe(true);
      expect(service.canSend(ConsentState.OPTED_IN, MessageChannel.SMS)).toBe(true);
    });
  });

  describe("getStatesForPhones", () => {
    it("short-circuits to an empty map for no phones", async () => {
      const map = await service.getStatesForPhones("t1", MessageChannel.SMS, []);
      expect(map.size).toBe(0);
      expect(prisma.contactConsent.findMany).not.toHaveBeenCalled();
    });

    it("maps each phone to its consent state", async () => {
      prisma.contactConsent.findMany.mockResolvedValue([
        { phoneE164: "+61400000001", state: ConsentState.OPTED_OUT },
        { phoneE164: "+61400000002", state: ConsentState.OPTED_IN },
      ]);
      const map = await service.getStatesForPhones("t1", MessageChannel.SMS, [
        "+61400000001",
        "+61400000002",
      ]);
      expect(map.get("+61400000001")).toBe(ConsentState.OPTED_OUT);
      expect(map.get("+61400000002")).toBe(ConsentState.OPTED_IN);
      expect(prisma.contactConsent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: "t1", channel: MessageChannel.SMS, phoneE164: { in: ["+61400000001", "+61400000002"] } },
        }),
      );
    });
  });
});

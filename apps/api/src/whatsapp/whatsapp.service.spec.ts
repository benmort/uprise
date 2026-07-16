import { WhatsappService } from "./whatsapp.service";

function makePrisma(overrides: Record<string, any> = {}) {
  const base: any = {
    whatsappTemplate: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
    },
    ...overrides,
  };
  return base;
}

// ConfigService stub keyed by TWILIO_CONTENT_API_ENABLED.
function makeConfig(enabled: boolean) {
  return { get: (_key: string, def?: any) => (enabled ? true : def) } as any;
}

function makeTwilio(rows: any[] = []) {
  return { listWhatsappContentTemplates: jest.fn().mockResolvedValue(rows) } as any;
}

describe("WhatsappService", () => {
  describe("listTemplates", () => {
    it("scopes to the tenant and lowercases a status filter", async () => {
      const prisma = makePrisma();
      const service = new WhatsappService(prisma, makeConfig(false), makeTwilio());
      await service.listTemplates("t1", { status: "APPROVED" });
      const call = prisma.whatsappTemplate.findMany.mock.calls[0][0];
      expect(call.where).toEqual({ tenantId: "t1", status: "approved" });
      expect(call.orderBy).toEqual([{ status: "asc" }, { friendlyName: "asc" }]);
    });

    it("omits the status filter when none is given", async () => {
      const prisma = makePrisma();
      const service = new WhatsappService(prisma, makeConfig(false), makeTwilio());
      await service.listTemplates("t1");
      expect(prisma.whatsappTemplate.findMany.mock.calls[0][0].where).toEqual({ tenantId: "t1" });
    });
  });

  describe("syncTemplates", () => {
    it("is a no-op that returns the local templates when the Content API is disabled", async () => {
      const prisma = makePrisma();
      const twilio = makeTwilio();
      const service = new WhatsappService(prisma, makeConfig(false), twilio);
      const res = await service.syncTemplates("t1");
      expect(res.synced).toBe(0);
      expect((res as any).skipped).toMatch(/TWILIO_CONTENT_API_ENABLED/);
      expect(twilio.listWhatsappContentTemplates).not.toHaveBeenCalled();
      expect(prisma.whatsappTemplate.upsert).not.toHaveBeenCalled();
    });

    it("upserts each remote template by contentSid and reports the count", async () => {
      const prisma = makePrisma();
      const twilio = makeTwilio([
        {
          contentSid: "HX1",
          friendlyName: "welcome",
          category: "UTILITY",
          language: "en",
          status: "approved",
          variables: { "1": "name" },
          bodyPreview: "Hi {{1}}",
        },
        {
          contentSid: "HX2",
          friendlyName: "reminder",
          category: "MARKETING",
          language: "en",
          status: "pending",
          variables: null,
          bodyPreview: null,
        },
      ]);
      const service = new WhatsappService(prisma, makeConfig(true), twilio);

      const res = await service.syncTemplates("t1");

      expect(res.synced).toBe(2);
      expect(prisma.whatsappTemplate.upsert).toHaveBeenCalledTimes(2);
      const first = prisma.whatsappTemplate.upsert.mock.calls[0][0];
      expect(first.where).toEqual({ contentSid: "HX1" });
      expect(first.create).toMatchObject({ tenantId: "t1", contentSid: "HX1", friendlyName: "welcome" });
      expect(first.update).toMatchObject({ tenantId: "t1", friendlyName: "welcome" });
    });

    it("skips templates missing a contentSid", async () => {
      const prisma = makePrisma();
      const twilio = makeTwilio([
        { contentSid: "", friendlyName: "no-sid" },
        { contentSid: "HX9", friendlyName: "ok", variables: null },
      ]);
      const service = new WhatsappService(prisma, makeConfig(true), twilio);
      const res = await service.syncTemplates("t1");
      expect(res.synced).toBe(1);
      expect(prisma.whatsappTemplate.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.whatsappTemplate.upsert.mock.calls[0][0].where).toEqual({ contentSid: "HX9" });
    });
  });
});

import { DispositionLayer, EngagementChannel } from "@uprise/db";
import { EngagementService } from "./engagement.service";

describe("EngagementService", () => {
  let prisma: any;
  let events: any;
  let canned: any;
  let service: EngagementService;

  beforeEach(() => {
    prisma = {
      disposition: { create: jest.fn(async ({ data }: any) => ({ id: "d1", ...data })) },
      questionResponse: { create: jest.fn(async ({ data }: any) => ({ id: "qr1", ...data })) },
      questionOption: { findUnique: jest.fn() },
      dispositionDef: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(async ({ data }: any) => ({ id: "def1", ...data })),
        update: jest.fn(async ({ data }: any) => ({ id: "def1", ...data })),
        delete: jest.fn(),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    events = { emit: jest.fn() };
    canned = { getById: jest.fn() };
    service = new EngagementService(prisma, events, canned);
  });

  describe("recordSurveyAnswer", () => {
    it("writes only a QuestionResponse when the option maps no disposition", async () => {
      prisma.questionOption.findUnique.mockResolvedValue({ id: "opt1", dispositionCode: null });

      await service.recordSurveyAnswer("org_1", {
        contactId: "c1",
        questionId: "q1",
        optionId: "opt1",
        channel: EngagementChannel.DOOR,
      });

      expect(prisma.questionResponse.create).toHaveBeenCalledTimes(1);
      expect(prisma.disposition.create).not.toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith(
        "engagement.answer",
        expect.objectContaining({ contactId: "c1", questionId: "q1" }),
      );
    });

    it("also writes a Disposition when the chosen option maps a disposition code", async () => {
      prisma.questionOption.findUnique.mockResolvedValue({
        id: "opt2",
        dispositionCode: "spoke_to_target",
        supportLevel: "STRONG_SUPPORT",
      });
      prisma.dispositionDef.findFirst.mockResolvedValue({ layer: DispositionLayer.CONTACT_RESULT });

      await service.recordSurveyAnswer("org_1", {
        contactId: "c1",
        questionId: "q1",
        optionId: "opt2",
        channel: EngagementChannel.DOOR,
      });

      expect(prisma.questionResponse.create).toHaveBeenCalledTimes(1);
      expect(prisma.disposition.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          contactId: "c1",
          code: "spoke_to_target",
          layer: DispositionLayer.CONTACT_RESULT,
          channel: EngagementChannel.DOOR,
          supportLevel: "STRONG_SUPPORT",
        }),
      });
    });
  });

  describe("recordDisposition", () => {
    it("denormalises the layer from the disposition catalog", async () => {
      prisma.dispositionDef.findFirst.mockResolvedValue({ layer: DispositionLayer.TERMINAL });

      const result = await service.recordDisposition("org_1", {
        contactId: "c1",
        code: "moved",
        channel: EngagementChannel.DOOR,
      });

      expect(result.layer).toBe(DispositionLayer.TERMINAL);
      expect(events.emit).toHaveBeenCalledWith("engagement.disposition", expect.any(Object));
    });

    it("falls back to CONTACT_RESULT when the code is unknown", async () => {
      prisma.dispositionDef.findFirst.mockResolvedValue(null);

      const result = await service.recordDisposition("org_1", {
        contactId: "c1",
        code: "made_up",
        channel: EngagementChannel.SMS,
      });

      expect(result.layer).toBe(DispositionLayer.CONTACT_RESULT);
    });
  });

  describe("useCannedResponse", () => {
    it("logs the mapped disposition and returns the body to send", async () => {
      canned.getById.mockResolvedValue({ id: "cr1", body: "Thanks!", dispositionCode: "refused" });
      prisma.dispositionDef.findFirst.mockResolvedValue({ layer: DispositionLayer.CONTACT_RESULT });

      const result = await service.useCannedResponse("org_1", {
        cannedResponseId: "cr1",
        contactId: "c1",
        channel: EngagementChannel.SMS,
      });

      expect(result.body).toBe("Thanks!");
      expect(result.disposition?.code).toBe("refused");
      expect(prisma.disposition.create).toHaveBeenCalledTimes(1);
    });

    it("returns the body without a disposition when the canned reply maps none", async () => {
      canned.getById.mockResolvedValue({ id: "cr2", body: "Hi", dispositionCode: null });

      const result = await service.useCannedResponse("org_1", {
        cannedResponseId: "cr2",
        contactId: "c1",
        channel: EngagementChannel.SMS,
      });

      expect(result.body).toBe("Hi");
      expect(result.disposition).toBeNull();
      expect(prisma.disposition.create).not.toHaveBeenCalled();
    });
  });

  describe("disposition-def authoring", () => {
    it("creates an org contact-result def with next order index", async () => {
      prisma.dispositionDef.findFirst.mockResolvedValue({ orderIndex: 60 });
      const def = await service.createDispositionDef("org_1", { code: "moved_recent", label: "Moved recently" });
      expect(def.tenantId).toBe("org_1");
      expect(def.layer).toBe(DispositionLayer.CONTACT_RESULT);
      expect(def.isLocked).toBe(false);
      expect(def.orderIndex).toBe(70);
    });

    it("refuses to edit a locked system default", async () => {
      prisma.dispositionDef.findUnique.mockResolvedValue({ id: "def1", tenantId: "org_1", isLocked: true });
      await expect(service.updateDispositionDef("org_1", "def1", { label: "x" })).rejects.toThrow();
      expect(prisma.dispositionDef.update).not.toHaveBeenCalled();
    });

    it("refuses to edit another org's / shared def", async () => {
      prisma.dispositionDef.findUnique.mockResolvedValue({ id: "def1", tenantId: null, isLocked: false });
      await expect(service.updateDispositionDef("org_1", "def1", { label: "x" })).rejects.toThrow();
    });

    it("deletes an editable org def", async () => {
      prisma.dispositionDef.findUnique.mockResolvedValue({ id: "def1", tenantId: "org_1", isLocked: false });
      const res = await service.deleteDispositionDef("org_1", "def1");
      expect(prisma.dispositionDef.delete).toHaveBeenCalledWith({ where: { id: "def1" } });
      expect(res.deleted).toBe(true);
    });
  });
});

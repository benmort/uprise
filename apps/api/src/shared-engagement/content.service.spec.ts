import { ContentObjectType, ContentSlot, ContentType, EngagementChannel } from "@uprise/db";
import { ContentService } from "./content.service";

/** A prisma mock whose $transaction runs the callback against the same mock. */
function makePrisma(overrides: Record<string, any> = {}) {
  const base: any = {
    survey: { findFirst: jest.fn(), updateMany: jest.fn() },
    script: { findFirst: jest.fn(), updateMany: jest.fn() },
    dispositionSet: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    dispositionSetItem: { findMany: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
    cannedSet: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    cannedSetItem: { findMany: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
    dispositionDef: { findMany: jest.fn().mockResolvedValue([]) },
    cannedResponse: { findMany: jest.fn().mockResolvedValue([]) },
    canvassCampaign: { findFirst: jest.fn(), updateMany: jest.fn() },
    blast: { findFirst: jest.fn() },
    contentBinding: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async ({ data }: any) => ({ id: "b1", ...data })),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    ...overrides,
  };
  base.$transaction = jest.fn(async (cb: any) => cb(base));
  return base;
}

describe("ContentService", () => {
  let prisma: any;
  let service: ContentService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ContentService(prisma);
  });

  describe("createBinding", () => {
    const input = {
      contentType: ContentType.SURVEY,
      contentId: "s1",
      objectType: ContentObjectType.CANVASS_CAMPAIGN,
      objectId: "c1",
    };

    it("rejects a binding whose content isn't in the tenant", async () => {
      prisma.survey.findFirst.mockResolvedValue(null);
      await expect(service.createBinding("org1", input)).rejects.toMatchObject({ response: { error: { code: "CONTENT_NOT_FOUND" } } });
      expect(prisma.contentBinding.create).not.toHaveBeenCalled();
    });

    it("rejects a binding whose target object isn't in the tenant", async () => {
      prisma.survey.findFirst.mockResolvedValue({ id: "s1" });
      prisma.canvassCampaign.findFirst.mockResolvedValue(null);
      await expect(service.createBinding("org1", input)).rejects.toMatchObject({ response: { error: { code: "OBJECT_NOT_FOUND" } } });
    });

    it("replaces any existing content in the slot, then creates + mirrors the legacy fields", async () => {
      prisma.survey.findFirst.mockResolvedValue({ id: "s1" });
      prisma.canvassCampaign.findFirst.mockResolvedValue({ id: "c1" });
      const res = await service.createBinding("org1", input);
      expect(prisma.contentBinding.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ contentType: ContentType.SURVEY, slot: ContentSlot.PRIMARY }) }),
      );
      expect(res.contentId).toBe("s1");
      // Legacy mirror is the per-campaign CanvassCampaign.surveyId only — we must NOT
      // write the single-valued Survey.campaignId (it would clobber the door survey of
      // any other campaign the survey is reused on).
      expect(prisma.canvassCampaign.updateMany).toHaveBeenCalledWith({ where: { id: "c1", tenantId: "org1" }, data: { surveyId: "s1" } });
      expect(prisma.survey.updateMany).not.toHaveBeenCalled();
    });

    it("does not mirror legacy fields for a blast binding", async () => {
      prisma.survey.findFirst.mockResolvedValue({ id: "s1" });
      prisma.blast.findFirst.mockResolvedValue({ id: "bl1" });
      await service.createBinding("org1", { ...input, objectType: ContentObjectType.BLAST, objectId: "bl1" });
      expect(prisma.canvassCampaign.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("deleteBinding", () => {
    it("throws when the binding isn't the tenant's", async () => {
      prisma.contentBinding.findFirst.mockResolvedValue(null);
      await expect(service.deleteBinding("org1", "b1")).rejects.toMatchObject({ response: { error: { code: "BINDING_NOT_FOUND" } } });
    });

    it("clears the legacy survey mirror when a primary canvass survey binding is removed", async () => {
      prisma.contentBinding.findFirst.mockResolvedValue({
        id: "b1",
        slot: ContentSlot.PRIMARY,
        objectType: ContentObjectType.CANVASS_CAMPAIGN,
        contentType: ContentType.SURVEY,
        objectId: "c1",
        contentId: "s1",
      });
      const res = await service.deleteBinding("org1", "b1");
      expect(res).toEqual({ deleted: true });
      expect(prisma.canvassCampaign.updateMany).toHaveBeenCalledWith({ where: { id: "c1", tenantId: "org1" }, data: { surveyId: null } });
    });
  });

  describe("resolveFlow", () => {
    it("loads the bound survey + script and dispositions from the bound set", async () => {
      prisma.contentBinding.findMany.mockResolvedValue([
        { contentType: ContentType.SURVEY, slot: ContentSlot.PRIMARY, contentId: "s1" },
        { contentType: ContentType.SCRIPT, slot: ContentSlot.PRIMARY, contentId: "sc1" },
        { contentType: ContentType.DISPOSITION_SET, slot: ContentSlot.PRIMARY, contentId: "ds1" },
      ]);
      prisma.survey.findFirst.mockResolvedValue({ id: "s1", questions: [] });
      prisma.script.findFirst.mockResolvedValue({ id: "sc1", steps: [] });
      prisma.dispositionSetItem.findMany.mockResolvedValue([{ dispositionDef: { id: "d1", code: "spoke" } }]);

      const flow = await service.resolveFlow("org1", ContentObjectType.CANVASS_CAMPAIGN, "c1");
      expect(flow.survey?.id).toBe("s1");
      expect(flow.script?.id).toBe("sc1");
      expect(flow.dispositions).toEqual([{ id: "d1", code: "spoke" }]);
      expect(prisma.dispositionDef.findMany).not.toHaveBeenCalled(); // set won, no fallback
    });

    it("falls back to tenant-default dispositions + canned when nothing is bound", async () => {
      prisma.contentBinding.findMany.mockResolvedValue([]);
      prisma.dispositionDef.findMany.mockResolvedValue([{ id: "d0", code: "not_home" }]);
      prisma.cannedResponse.findMany.mockResolvedValue([{ id: "cr0", isArchived: false }]);

      const flow = await service.resolveFlow("org1", ContentObjectType.BLAST, "bl1");
      expect(flow.survey).toBeNull();
      expect(flow.dispositions).toEqual([{ id: "d0", code: "not_home" }]);
      expect(prisma.dispositionDef.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ channel: { in: [EngagementChannel.SMS, EngagementChannel.BOTH] } }) }),
      );
    });
  });

  describe("usage", () => {
    it("counts bound objects and resolves their names", async () => {
      prisma.contentBinding.findMany.mockResolvedValue([
        { id: "b1", objectType: ContentObjectType.CANVASS_CAMPAIGN, objectId: "c1", slot: ContentSlot.PRIMARY },
        { id: "b2", objectType: ContentObjectType.BLAST, objectId: "bl1", slot: ContentSlot.PRIMARY },
      ]);
      prisma.canvassCampaign.findFirst.mockResolvedValue({ name: "Doorknock" });
      prisma.blast.findFirst.mockResolvedValue({ title: "Text wave" });
      const res = await service.usage("org1", ContentType.SURVEY, "s1");
      expect(res.count).toBe(2);
      expect(res.objects[0].objectName).toBe("Doorknock");
      expect(res.objects[1].objectName).toBe("Text wave");
    });
  });

  describe("disposition sets", () => {
    it("creates a set with ordered items", async () => {
      prisma.dispositionDef.findMany.mockResolvedValue([{ id: "d1" }, { id: "d2" }]);
      prisma.dispositionSet.create.mockResolvedValue({ id: "ds1", items: [] });
      await service.createDispositionSet("org1", { name: "Door set", items: [{ id: "d1" }, { id: "d2", orderIndex: 5 }] });
      expect(prisma.dispositionSet.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "Door set",
            items: { create: [{ dispositionDefId: "d1", orderIndex: 0 }, { dispositionDefId: "d2", orderIndex: 5 }] },
          }),
        }),
      );
    });

    it("replaces items on update", async () => {
      prisma.dispositionSet.findFirst.mockResolvedValue({ id: "ds1" });
      prisma.dispositionDef.findMany.mockResolvedValue([{ id: "d3" }]);
      prisma.dispositionSet.findUnique.mockResolvedValue({ id: "ds1", items: [] });
      await service.updateDispositionSet("org1", "ds1", { name: "x", items: [{ id: "d3" }] });
      expect(prisma.dispositionSetItem.deleteMany).toHaveBeenCalledWith({ where: { setId: "ds1" } });
      expect(prisma.dispositionSetItem.create).toHaveBeenCalledWith({ data: { setId: "ds1", dispositionDefId: "d3", orderIndex: 0 } });
    });

    it("archives on delete", async () => {
      prisma.dispositionSet.findFirst.mockResolvedValue({ id: "ds1" });
      const res = await service.deleteDispositionSet("org1", "ds1");
      expect(res).toEqual({ archived: true });
      expect(prisma.dispositionSet.update).toHaveBeenCalledWith({ where: { id: "ds1" }, data: { isArchived: true } });
    });

    it("throws getting a set that isn't the tenant's", async () => {
      prisma.dispositionSet.findFirst.mockResolvedValue(null);
      await expect(service.getDispositionSet("org1", "nope")).rejects.toMatchObject({ response: { error: { code: "SET_NOT_FOUND" } } });
    });
  });

  describe("canned sets", () => {
    it("creates and archives", async () => {
      prisma.cannedResponse.findMany.mockResolvedValue([{ id: "cr1" }]);
      prisma.cannedSet.create.mockResolvedValue({ id: "cs1", items: [] });
      await service.createCannedSet("org1", { name: "Replies", items: [{ id: "cr1" }] });
      expect(prisma.cannedSet.create).toHaveBeenCalled();

      prisma.cannedSet.findFirst.mockResolvedValue({ id: "cs1" });
      const res = await service.deleteCannedSet("org1", "cs1");
      expect(res).toEqual({ archived: true });
    });

    it("resolves canned from a bound set, skipping archived", async () => {
      prisma.contentBinding.findMany.mockResolvedValue([{ contentType: ContentType.CANNED_SET, slot: ContentSlot.PRIMARY, contentId: "cs1" }]);
      prisma.cannedSetItem.findMany.mockResolvedValue([
        { cannedResponse: { id: "a", isArchived: false } },
        { cannedResponse: { id: "b", isArchived: true } },
      ]);
      const flow = await service.resolveFlow("org1", ContentObjectType.BLAST, "bl1");
      expect(flow.canned).toEqual([{ id: "a", isArchived: false }]);
    });

    it("gets/lists canned sets and replaces items on update", async () => {
      prisma.cannedSet.findMany.mockResolvedValue([{ id: "cs1" }]);
      expect(await service.listCannedSets("org1")).toEqual([{ id: "cs1" }]);
      prisma.cannedSet.findFirst.mockResolvedValue({ id: "cs1", items: [] });
      expect((await service.getCannedSet("org1", "cs1")).id).toBe("cs1");
      prisma.cannedResponse.findMany.mockResolvedValue([{ id: "cr9" }]);
      prisma.cannedSet.findUnique.mockResolvedValue({ id: "cs1", items: [] });
      await service.updateCannedSet("org1", "cs1", { name: "n", items: [{ id: "cr9" }] });
      expect(prisma.cannedSetItem.deleteMany).toHaveBeenCalledWith({ where: { setId: "cs1" } });
      expect(prisma.cannedSetItem.create).toHaveBeenCalledWith({ data: { setId: "cs1", cannedResponseId: "cr9", orderIndex: 0 } });
    });

    it("throws getting a canned set that isn't the tenant's", async () => {
      prisma.cannedSet.findFirst.mockResolvedValue(null);
      await expect(service.getCannedSet("org1", "nope")).rejects.toMatchObject({ response: { error: { code: "SET_NOT_FOUND" } } });
    });
  });

  describe("bindings listing + script mirror", () => {
    it("lists bindings on an object with a resolved content label per row", async () => {
      prisma.contentBinding.findMany.mockResolvedValue([
        { id: "b1", contentType: ContentType.SURVEY, contentId: "s1", slot: ContentSlot.PRIMARY },
        { id: "b2", contentType: ContentType.SCRIPT, contentId: "sc1", slot: ContentSlot.PRIMARY },
      ]);
      prisma.survey.findFirst.mockResolvedValue({ name: "Persuasion" });
      prisma.script.findFirst.mockResolvedValue({ name: "Opener" });
      const rows = await service.listBindings("org1", ContentObjectType.CANVASS_CAMPAIGN, "c1");
      expect(rows.map((r) => r.contentName)).toEqual(["Persuasion", "Opener"]);
    });

    it("mirrors + clears the legacy script fields on a primary canvass script bind/unbind", async () => {
      prisma.script.findFirst.mockResolvedValue({ id: "sc1" });
      prisma.canvassCampaign.findFirst.mockResolvedValue({ id: "c1" });
      await service.createBinding("org1", {
        contentType: ContentType.SCRIPT,
        contentId: "sc1",
        objectType: ContentObjectType.CANVASS_CAMPAIGN,
        objectId: "c1",
      });
      expect(prisma.canvassCampaign.updateMany).toHaveBeenCalledWith({ where: { id: "c1", tenantId: "org1" }, data: { scriptId: "sc1" } });
      expect(prisma.script.updateMany).not.toHaveBeenCalled();

      prisma.contentBinding.findFirst.mockResolvedValue({
        id: "b9",
        slot: ContentSlot.PRIMARY,
        objectType: ContentObjectType.CANVASS_CAMPAIGN,
        contentType: ContentType.SCRIPT,
        objectId: "c1",
        contentId: "sc1",
      });
      await service.deleteBinding("org1", "b9");
      expect(prisma.canvassCampaign.updateMany).toHaveBeenCalledWith({ where: { id: "c1", tenantId: "org1" }, data: { scriptId: null } });
    });

    it("lists disposition sets and gets one with items", async () => {
      prisma.dispositionSet.findMany.mockResolvedValue([{ id: "ds1" }]);
      expect(await service.listDispositionSets("org1")).toEqual([{ id: "ds1" }]);
      prisma.dispositionSet.findFirst.mockResolvedValue({ id: "ds1", items: [{ dispositionDef: { code: "x" } }] });
      const set = await service.getDispositionSet("org1", "ds1");
      expect(set.items).toHaveLength(1);
    });
  });

  describe("tenant isolation of set items", () => {
    it("rejects a disposition set item that isn't the tenant's (or a system default)", async () => {
      prisma.dispositionDef.findMany.mockResolvedValue([]); // neither owned nor null-tenant
      await expect(service.createDispositionSet("org1", { name: "x", items: [{ id: "foreign" }] })).rejects.toMatchObject({
        response: { error: { code: "DISPOSITION_NOT_FOUND" } },
      });
      expect(prisma.dispositionSet.create).not.toHaveBeenCalled();
    });

    it("rejects a canned set item that isn't the tenant's", async () => {
      prisma.cannedResponse.findMany.mockResolvedValue([]);
      await expect(service.createCannedSet("org1", { name: "x", items: [{ id: "foreign" }] })).rejects.toMatchObject({
        response: { error: { code: "CANNED_NOT_FOUND" } },
      });
      expect(prisma.cannedSet.create).not.toHaveBeenCalled();
    });

    it("allows a null-tenant system-default disposition in a set", async () => {
      prisma.dispositionDef.findMany.mockResolvedValue([{ id: "sysdef" }]);
      prisma.dispositionSet.create.mockResolvedValue({ id: "ds1", items: [] });
      await expect(service.createDispositionSet("org1", { name: "x", items: [{ id: "sysdef" }] })).resolves.toBeTruthy();
    });
  });

  describe("flow channel + canned privacy", () => {
    it("resolves an SMS canvass campaign's dispositions on the SMS+BOTH channels, not DOOR", async () => {
      prisma.contentBinding.findMany.mockResolvedValue([]);
      prisma.canvassCampaign.findFirst.mockResolvedValue({ channel: EngagementChannel.SMS });
      prisma.dispositionDef.findMany.mockResolvedValue([]);
      await service.resolveFlow("org1", ContentObjectType.CANVASS_CAMPAIGN, "c1");
      expect(prisma.dispositionDef.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ channel: { in: [EngagementChannel.SMS, EngagementChannel.BOTH] } }) }),
      );
    });

    it("excludes PERSONAL canned replies from the fallback (no caller context to scope them)", async () => {
      prisma.contentBinding.findMany.mockResolvedValue([]);
      prisma.canvassCampaign.findFirst.mockResolvedValue({ channel: EngagementChannel.DOOR });
      prisma.cannedResponse.findMany.mockResolvedValue([]);
      await service.resolveFlow("org1", ContentObjectType.CANVASS_CAMPAIGN, "c1");
      expect(prisma.cannedResponse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ visibility: { in: ["ORG", "AUTO_SEND"] } }) }),
      );
    });
  });
});

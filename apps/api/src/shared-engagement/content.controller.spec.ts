import { ContentObjectType, ContentType } from "@uprise/db";
import { ContentController } from "./content.controller";

describe("ContentController", () => {
  let content: any;
  let controller: ContentController;

  beforeEach(() => {
    content = {
      createBinding: jest.fn().mockResolvedValue({ id: "b1" }),
      deleteBinding: jest.fn().mockResolvedValue({ deleted: true }),
      listBindings: jest.fn().mockResolvedValue([]),
      resolveFlow: jest.fn().mockResolvedValue({ survey: null }),
      usage: jest.fn().mockResolvedValue({ count: 0, objects: [] }),
      listDispositionSets: jest.fn().mockResolvedValue([]),
      getDispositionSet: jest.fn().mockResolvedValue({ id: "ds1" }),
      createDispositionSet: jest.fn().mockResolvedValue({ id: "ds1" }),
      updateDispositionSet: jest.fn().mockResolvedValue({ id: "ds1" }),
      deleteDispositionSet: jest.fn().mockResolvedValue({ archived: true }),
      listCannedSets: jest.fn().mockResolvedValue([]),
      getCannedSet: jest.fn().mockResolvedValue({ id: "cs1" }),
      createCannedSet: jest.fn().mockResolvedValue({ id: "cs1" }),
      updateCannedSet: jest.fn().mockResolvedValue({ id: "cs1" }),
      deleteCannedSet: jest.fn().mockResolvedValue({ archived: true }),
    };
    controller = new ContentController(content);
  });

  it("delegates binding create/delete/list/flow/usage with the tenant id", async () => {
    const dto = { contentType: ContentType.SURVEY, contentId: "s1", objectType: ContentObjectType.CANVASS_CAMPAIGN, objectId: "c1" };
    await controller.createBinding("org1", dto);
    expect(content.createBinding).toHaveBeenCalledWith("org1", dto);
    await controller.deleteBinding("org1", "b1");
    expect(content.deleteBinding).toHaveBeenCalledWith("org1", "b1");
    await controller.listBindings("org1", ContentObjectType.CANVASS_CAMPAIGN, "c1");
    expect(content.listBindings).toHaveBeenCalledWith("org1", ContentObjectType.CANVASS_CAMPAIGN, "c1");
    await controller.flow("org1", ContentObjectType.BLAST, "bl1");
    expect(content.resolveFlow).toHaveBeenCalledWith("org1", ContentObjectType.BLAST, "bl1");
    await controller.usage("org1", ContentType.SURVEY, "s1");
    expect(content.usage).toHaveBeenCalledWith("org1", ContentType.SURVEY, "s1");
  });

  it("delegates disposition-set CRUD", async () => {
    await controller.listDispositionSets("org1");
    await controller.getDispositionSet("org1", "ds1");
    await controller.createDispositionSet("org1", { name: "x" });
    await controller.updateDispositionSet("org1", "ds1", { name: "y" });
    await controller.deleteDispositionSet("org1", "ds1");
    expect(content.createDispositionSet).toHaveBeenCalledWith("org1", { name: "x" });
    expect(content.deleteDispositionSet).toHaveBeenCalledWith("org1", "ds1");
  });

  it("delegates canned-set CRUD", async () => {
    await controller.listCannedSets("org1");
    await controller.getCannedSet("org1", "cs1");
    await controller.createCannedSet("org1", { name: "x" });
    await controller.updateCannedSet("org1", "cs1", { name: "y" });
    await controller.deleteCannedSet("org1", "cs1");
    expect(content.createCannedSet).toHaveBeenCalledWith("org1", { name: "x" });
    expect(content.deleteCannedSet).toHaveBeenCalledWith("org1", "cs1");
  });
});

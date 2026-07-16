import { TagsController } from "./tags.controller";

describe("TagsController", () => {
  let tags: any;
  let controller: TagsController;

  beforeEach(() => {
    tags = {
      listTags: jest.fn().mockResolvedValue([]),
      createTag: jest.fn().mockResolvedValue({ id: "t1" }),
      deleteTag: jest.fn().mockResolvedValue({ deleted: true }),
      getContactTags: jest.fn().mockResolvedValue([]),
      assignTag: jest.fn().mockResolvedValue({ ok: true }),
      removeTag: jest.fn().mockResolvedValue({ removed: true }),
    };
    controller = new TagsController(tags);
  });

  it("delegates every route with the tenant id", async () => {
    await controller.list("org1");
    expect(tags.listTags).toHaveBeenCalledWith("org1");
    await controller.create("org1", { label: "VIP" });
    expect(tags.createTag).toHaveBeenCalledWith("org1", { label: "VIP" });
    await controller.remove("org1", "t1");
    expect(tags.deleteTag).toHaveBeenCalledWith("org1", "t1");
    await controller.forContact("org1", "c1");
    expect(tags.getContactTags).toHaveBeenCalledWith("org1", "c1");
    await controller.assign("org1", "c1", { tagId: "t1" });
    expect(tags.assignTag).toHaveBeenCalledWith("org1", "c1", "t1");
    await controller.unassign("org1", "c1", "t1");
    expect(tags.removeTag).toHaveBeenCalledWith("org1", "c1", "t1");
  });
});

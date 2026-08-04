import "reflect-metadata";
import { ActionsController } from "./actions.controller";
import { REQUIRE_PERMISSION_KEY } from "../auth/require-permission.decorator";

describe("ActionsController", () => {
  const service = {
    list: jest.fn().mockResolvedValue({ pages: [], total: 0 }),
    create: jest.fn().mockResolvedValue({ id: "p1" }),
    get: jest.fn().mockResolvedValue({ id: "p1" }),
    update: jest.fn().mockResolvedValue({ id: "p1" }),
    publish: jest.fn().mockResolvedValue({ id: "p1" }),
    unpublish: jest.fn().mockResolvedValue({ id: "p1" }),
    archive: jest.fn().mockResolvedValue({ id: "p1" }),
    restore: jest.fn().mockResolvedValue({ id: "p1" }),
    previewToken: jest.fn().mockResolvedValue({ token: "t", expiresAt: "x" }),
    results: jest.fn().mockResolvedValue({ stats: {}, sessions: [] }),
  } as never as ConstructorParameters<typeof ActionsController>[0];
  const c = new ActionsController(service);

  beforeEach(() => jest.clearAllMocks());

  it("every route carries @RequirePermission", () => {
    const methods = [
      "list",
      "create",
      "get",
      "update",
      "publish",
      "unpublish",
      "archive",
      "restore",
      "previewToken",
      "results",
    ] as const;
    for (const m of methods) {
      const perm = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, ActionsController.prototype[m]);
      expect(perm).toBeDefined();
      expect(perm.resource).toBe("actions.page");
    }
  });

  it("reads use read; mutations use manage", () => {
    const readOnly = ["list", "get", "results"] as const;
    const manage = ["create", "update", "publish", "unpublish", "archive", "restore", "previewToken"] as const;
    for (const m of readOnly) {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, ActionsController.prototype[m]).action).toBe("read");
    }
    for (const m of manage) {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, ActionsController.prototype[m]).action).toBe("manage");
    }
  });

  it("delegates with tenant scoping", () => {
    c.list("t1", { status: "DRAFT" } as never);
    c.create("t1", { title: "Ring your MP" } as never);
    c.update("t1", "p1", { headline: "h" } as never);
    c.results("t1", "p1", "10", "0");
    expect((service as never as { list: jest.Mock }).list).toHaveBeenCalledWith("t1", { status: "DRAFT" });
    expect((service as never as { create: jest.Mock }).create).toHaveBeenCalledWith("t1", "Ring your MP");
    expect((service as never as { update: jest.Mock }).update).toHaveBeenCalledWith("t1", "p1", { headline: "h" });
    expect((service as never as { results: jest.Mock }).results).toHaveBeenCalledWith("t1", "p1", {
      limit: 10,
      offset: 0,
    });
  });

  it("clamps results paging", () => {
    c.results("t1", "p1", "9999", "-5");
    expect((service as never as { results: jest.Mock }).results).toHaveBeenCalledWith("t1", "p1", {
      limit: 100,
      offset: 0,
    });
  });
});

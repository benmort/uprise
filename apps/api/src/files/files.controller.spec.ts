import { FilesController } from "./files.controller";
import type { FilesService } from "./files.service";

describe("FilesController", () => {
  const makeSvc = () =>
    ({
      list: jest.fn().mockResolvedValue([{ id: "f1" }]),
      summary: jest.fn().mockResolvedValue({ count: 1 }),
      upload: jest.fn().mockResolvedValue({ id: "f1" }),
      remove: jest.fn().mockResolvedValue({ id: "f1" }),
    }) as unknown as jest.Mocked<FilesService>;

  it("list delegates with tenantId + query", async () => {
    const svc = makeSvc();
    const c = new FilesController(svc);
    const query = { take: 10, skip: 0, folder: "logos" };
    await c.list("t1", query);
    expect(svc.list).toHaveBeenCalledWith("t1", query);
  });

  it("summary delegates with tenantId", async () => {
    const svc = makeSvc();
    const c = new FilesController(svc);
    await c.summary("t1");
    expect(svc.summary).toHaveBeenCalledWith("t1");
  });

  it("upload delegates with tenantId, file + folder", async () => {
    const svc = makeSvc();
    const c = new FilesController(svc);
    const file = {
      buffer: Buffer.from("hello"),
      originalname: "a.png",
      mimetype: "image/png",
      size: 5,
    };
    await c.upload("t1", file, "logos");
    expect(svc.upload).toHaveBeenCalledWith("t1", file, "logos");
  });

  it("remove delegates with tenantId + id", async () => {
    const svc = makeSvc();
    const c = new FilesController(svc);
    await c.remove("t1", "f1");
    expect(svc.remove).toHaveBeenCalledWith("t1", "f1");
  });
});

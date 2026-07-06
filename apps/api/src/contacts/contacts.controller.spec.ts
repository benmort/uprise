import { HttpStatus } from "@nestjs/common";
import { ContactsController } from "./contacts.controller";
import { ApiHttpException } from "../common/http/api-response";
import type { ContactsService } from "./contacts.service";

describe("ContactsController", () => {
  const makeSvc = () =>
    ({
      search: jest.fn().mockResolvedValue([{ id: "c1" }]),
      getProfile: jest.fn().mockResolvedValue({ id: "c1" }),
      updateContact: jest.fn().mockResolvedValue({ id: "c1" }),
    }) as unknown as jest.Mocked<ContactsService>;

  it("search delegates with tenantId + query", async () => {
    const svc = makeSvc();
    const c = new ContactsController(svc);
    await expect(c.search("t1", "ada")).resolves.toEqual([{ id: "c1" }]);
    expect(svc.search).toHaveBeenCalledWith("t1", "ada");
  });

  it("search defaults query to empty string", async () => {
    const svc = makeSvc();
    const c = new ContactsController(svc);
    await c.search("t1");
    expect(svc.search).toHaveBeenCalledWith("t1", "");
  });

  it("profile delegates + returns when found", async () => {
    const svc = makeSvc();
    const c = new ContactsController(svc);
    await expect(c.profile("t1", "c1")).resolves.toEqual({ id: "c1" });
    expect(svc.getProfile).toHaveBeenCalledWith("t1", "c1");
  });

  it("profile 404s when the service returns null", async () => {
    const svc = makeSvc();
    (svc.getProfile as jest.Mock).mockResolvedValueOnce(null);
    const c = new ContactsController(svc);
    const err = await c.profile("t1", "missing").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiHttpException);
    expect((err as ApiHttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect((err as ApiHttpException).getResponse()).toMatchObject({
      error: { code: "CONTACT_NOT_FOUND" },
    });
  });

  it("update delegates with tenantId, id + dto", async () => {
    const svc = makeSvc();
    const c = new ContactsController(svc);
    const dto = { firstName: "Ada" } as Parameters<ContactsController["update"]>[2];
    await c.update("t1", "c1", dto);
    expect(svc.updateContact).toHaveBeenCalledWith("t1", "c1", dto);
  });
});

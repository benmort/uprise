import { NotFoundException } from "@nestjs/common";
import { BlastsService } from "./blasts.service";
import { TemplateRendererService } from "./template-renderer.service";
import { ComplianceService } from "./compliance.service";

/**
 * `getBlast` — fetching ONE blast by id.
 *
 * The composer had no such endpoint, so it resolved a blast by scanning `listBlasts`, which
 * hardcodes `take: 100` and ignores pagination. Past a hundred blasts, opening an older one showed
 * "Blast not found" at a URL naming a real blast, rendered an empty form, and the first autosave
 * took the `if (!blastId)` branch and created a DUPLICATE draft.
 *
 * Both properties below are load-bearing: it must find the row regardless of list position, and it
 * must stay tenant-scoped so an id from another tenant 404s rather than leaking.
 */
const configMock = { get: jest.fn((_k: string, fallback?: unknown) => fallback) } as any;

function build(prisma: any) {
  return new BlastsService(
    prisma,
    configMock,
    new TemplateRendererService(),
    new ComplianceService(configMock),
    { sendMessage: jest.fn() } as any,
    { resolve: jest.fn(), resolveByNumber: jest.fn(), resolveByNumberId: jest.fn(), invalidate: jest.fn() } as any,
    {} as any,
    {} as any,
    { isEnabled: jest.fn(async () => true) } as any,
  );
}

describe("BlastsService.getBlast", () => {
  it("fetches by id directly — never by scanning the capped list", async () => {
    const findFirst = jest.fn(async () => ({ id: "b1", tenantId: "t1", title: "Older blast" }));
    const findMany = jest.fn();
    const service = build({ blast: { findFirst, findMany } });

    const blast = await service.getBlast("t1", "b1");

    expect(blast).toMatchObject({ id: "b1", title: "Older blast" });
    // The whole point: no list read, so the 100-row cap cannot hide the blast.
    expect(findMany).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "b1", tenantId: "t1" } }),
    );
  });

  // The composer renders a recipient count, which listBlasts supplies via _count.
  it("includes the recipient count so the composer matches the list shape", async () => {
    const findFirst = jest.fn(async () => ({ id: "b1", tenantId: "t1", _count: { recipients: 42 } }));
    const service = build({ blast: { findFirst, findMany: jest.fn() } });

    const blast = await service.getBlast("t1", "b1");

    expect((blast as { _count: { recipients: number } })._count.recipients).toBe(42);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ include: { _count: { select: { recipients: true } } } }),
    );
  });

  it("404s rather than leaking another tenant's blast", async () => {
    // findFirst is tenant-scoped, so a foreign id simply misses.
    const findFirst = jest.fn(async () => null);
    const service = build({ blast: { findFirst, findMany: jest.fn() } });

    await expect(service.getBlast("t1", "someone-elses")).rejects.toBeInstanceOf(NotFoundException);
  });
});

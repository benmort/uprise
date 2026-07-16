import { BlastsService } from "./blasts.service";
import { TemplateRendererService } from "./template-renderer.service";
import { ComplianceService } from "./compliance.service";

// Focused coverage for blast from-number selection: persistence on create/update and
// the send-path precedence (explicit fromNumberId → resolveByNumberId, with fallback).

const configMock = { get: jest.fn((_k: string, fallback?: unknown) => fallback) } as any;

function makeSender() {
  return {
    resolve: jest.fn(async (): Promise<any> => undefined),
    resolveByNumber: jest.fn(async (): Promise<any> => undefined),
    resolveByNumberId: jest.fn(async (): Promise<any> => undefined),
    invalidate: jest.fn(),
  };
}

function build(prisma: any, sender = makeSender(), dryRun = true) {
  const flags = { isEnabled: jest.fn(async () => dryRun) } as any;
  const service = new BlastsService(
    prisma,
    configMock,
    new TemplateRendererService(),
    new ComplianceService(configMock),
    { sendMessage: jest.fn() } as any,
    sender as any,
    {} as any,
    {} as any,
    flags,
  );
  return { service, sender, flags };
}

describe("BlastsService — from-number selection", () => {
  it("createDraft persists the chosen fromNumberId", async () => {
    const create = jest.fn(async ({ data }: any) => ({ id: "b1", ...data }));
    const prisma: any = {
      $transaction: (cb: any) => cb(prisma),
      blast: { create },
      blastTemplate: { create: jest.fn() },
    };
    const { service } = build(prisma);

    await service.createDraft("t1", { title: "Doorknock", bodyTemplate: "Hi", fromNumberId: "num_42" });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fromNumberId: "num_42" }) }),
    );
  });

  it("createDraft stores null when no fromNumberId is given", async () => {
    const create = jest.fn(async ({ data }: any) => ({ id: "b1", ...data }));
    const prisma: any = {
      $transaction: (cb: any) => cb(prisma),
      blast: { create },
      blastTemplate: { create: jest.fn() },
    };
    const { service } = build(prisma);

    await service.createDraft("t1", { title: "Doorknock", bodyTemplate: "Hi" });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fromNumberId: null }) }),
    );
  });

  it("updateDraft writes fromNumberId when provided", async () => {
    const update = jest.fn(async ({ data }: any) => ({ id: "b1", ...data }));
    const prisma: any = {
      blast: {
        findFirst: jest.fn(async () => ({ id: "b1", tenantId: "t1", title: "T", audienceId: null, bodyTemplate: "Hi" })),
        update,
      },
      blastTemplate: { count: jest.fn(async () => 0), create: jest.fn() },
    };
    const { service } = build(prisma);

    await service.updateDraft("t1", "b1", { fromNumberId: "num_99" });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fromNumberId: "num_99" }) }),
    );
  });

  it("updateDraft clears fromNumberId when passed empty", async () => {
    const update = jest.fn(async ({ data }: any) => ({ id: "b1", ...data }));
    const prisma: any = {
      blast: {
        findFirst: jest.fn(async () => ({ id: "b1", tenantId: "t1", title: "T", audienceId: null, bodyTemplate: "Hi" })),
        update,
      },
      blastTemplate: { count: jest.fn(async () => 0), create: jest.fn() },
    };
    const { service } = build(prisma);

    await service.updateDraft("t1", "b1", { fromNumberId: "" });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fromNumberId: null }) }),
    );
  });

  it("updateDraft leaves fromNumberId untouched when the field is absent", async () => {
    const update = jest.fn(async ({ data }: any) => ({ id: "b1", ...data }));
    const prisma: any = {
      blast: {
        findFirst: jest.fn(async () => ({ id: "b1", tenantId: "t1", title: "T", audienceId: null, bodyTemplate: "Hi" })),
        update,
      },
      blastTemplate: { count: jest.fn(async () => 0), create: jest.fn() },
    };
    const { service } = build(prisma);

    await service.updateDraft("t1", "b1", { title: "New" });

    expect(update.mock.calls[0][0].data).not.toHaveProperty("fromNumberId");
  });

  it("proof send resolves the explicitly-chosen number over the tenant default", async () => {
    const prisma: any = {
      blast: {
        findFirst: jest.fn(async () => ({
          id: "b1",
          tenantId: "t1",
          bodyTemplate: "Hello",
          channel: "SMS",
          contentSid: null,
          contentVariableMap: null,
          fromNumberId: "num_pick",
        })),
      },
    };
    const sender = makeSender();
    sender.resolveByNumberId.mockResolvedValue({ accountSid: "AC", authToken: "x", from: "+61400000001" });
    const { service } = build(prisma, sender);

    await service.previewProof("t1", "b1", { proofNumber: "+61400000009" });

    expect(sender.resolveByNumberId).toHaveBeenCalledWith("t1", "num_pick");
    expect(sender.resolve).not.toHaveBeenCalled();
  });

  it("proof send falls back to the tenant default when the chosen number is inactive", async () => {
    const prisma: any = {
      blast: {
        findFirst: jest.fn(async () => ({
          id: "b1",
          tenantId: "t1",
          bodyTemplate: "Hello",
          channel: "SMS",
          contentSid: null,
          contentVariableMap: null,
          fromNumberId: "gone",
        })),
      },
    };
    const sender = makeSender(); // resolveByNumberId → undefined
    const { service } = build(prisma, sender);

    await service.previewProof("t1", "b1", { proofNumber: "+61400000009" });

    expect(sender.resolveByNumberId).toHaveBeenCalledWith("t1", "gone");
    expect(sender.resolve).toHaveBeenCalledWith({ tenantId: "t1", purpose: "marketing" });
  });
});

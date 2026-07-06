import { EmailController } from "./email.controller";
import type { EmailService } from "./email.service";

describe("EmailController", () => {
  const makeSvc = () =>
    ({
      emailHealth: jest.fn().mockResolvedValue({ ok: true }),
      listTemplates: jest.fn().mockResolvedValue([{ key: "welcome" }]),
      getTemplate: jest.fn().mockResolvedValue({ key: "welcome" }),
      upsertTemplate: jest.fn().mockResolvedValue({ key: "welcome" }),
      getEmail: jest.fn().mockResolvedValue({ id: "e1" }),
    }) as unknown as jest.Mocked<EmailService>;

  it("emailHealth delegates", async () => {
    const svc = makeSvc();
    const c = new EmailController(svc);
    await expect(c.emailHealth()).resolves.toEqual({ ok: true });
    expect(svc.emailHealth).toHaveBeenCalledWith();
  });

  it("listTemplates delegates with tenantId", async () => {
    const svc = makeSvc();
    const c = new EmailController(svc);
    await c.listTemplates("t1");
    expect(svc.listTemplates).toHaveBeenCalledWith("t1");
  });

  it("getTemplate delegates with tenantId + key", async () => {
    const svc = makeSvc();
    const c = new EmailController(svc);
    await c.getTemplate("t1", "welcome");
    expect(svc.getTemplate).toHaveBeenCalledWith("t1", "welcome");
  });

  it("upsertTemplate merges key into the dto", async () => {
    const svc = makeSvc();
    const c = new EmailController(svc);
    const dto = { subject: "Hi", body: "Body", isActive: true } as Parameters<
      EmailController["upsertTemplate"]
    >[2];
    await c.upsertTemplate("t1", "welcome", dto);
    expect(svc.upsertTemplate).toHaveBeenCalledWith("t1", { key: "welcome", ...dto });
  });

  it("getEmail delegates with tenantId + id", async () => {
    const svc = makeSvc();
    const c = new EmailController(svc);
    await c.getEmail("t1", "e1");
    expect(svc.getEmail).toHaveBeenCalledWith("t1", "e1");
  });
});

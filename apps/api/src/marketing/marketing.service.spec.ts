import { MarketingService } from "./marketing.service";

function setup() {
  const prisma: any = { tenant: { upsert: jest.fn(async () => ({ id: "t1", slug: "default" })) } };
  const config = {
    get: jest.fn((k: string, fb?: string) =>
      k === "MARKETING_NOTIFY_EMAIL" ? "hello@getup.org.au" : fb ?? "",
    ),
  } as any;
  const email = { sendTransactional: jest.fn(async () => ({ id: "e1" })) } as any;
  const logger = { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), log: jest.fn() } as any;
  const svc = new MarketingService(prisma, config, email, logger);
  return { svc, email };
}

describe("MarketingService", () => {
  it("submitContact emails the marketing inbox via the contact_form template", async () => {
    const { svc, email } = setup();
    await svc.submitContact({ name: "Ada", email: "ada@x.y", company: "Acme", message: "hi" });
    const call = email.sendTransactional.mock.calls[0][0];
    expect(call.toAddress).toBe("hello@getup.org.au");
    expect(call.templateKey).toBe("contact_form");
    expect(call.vars.message).toContain("Ada");
    expect(call.vars.message).toContain("hi");
  });

  it("requestDemo uses the demo_request template", async () => {
    const { svc, email } = setup();
    await svc.requestDemo({ name: "Ada", email: "ada@x.y", useCase: "Texting" });
    expect(email.sendTransactional.mock.calls[0][0].templateKey).toBe("demo_request");
  });

  it("newsletterSignup uses the newsletter template", async () => {
    const { svc, email } = setup();
    await svc.newsletterSignup({ email: "ada@x.y" });
    const call = email.sendTransactional.mock.calls[0][0];
    expect(call.templateKey).toBe("newsletter");
    expect(call.vars.message).toContain("ada@x.y");
  });
});

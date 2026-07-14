import { MarketingService } from "./marketing.service";

function setup() {
  const config = {
    get: jest.fn((_k: string, fb?: string) => fb ?? ""),
  } as any;
  const sendgrid = { send: jest.fn(async () => undefined) } as any;
  const logger = { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), log: jest.fn() } as any;
  const svc = new MarketingService(config, sendgrid, logger);
  return { svc, sendgrid };
}

// The marketing forms are pre-tenant: nothing is persisted. Each form emails the
// platform contact address (PLATFORM_CONTACT_EMAIL, default contact@upriselabs.org)
// via the platform SendGrid sender, so the specs assert on sendgrid.send, not a DB write.
describe("MarketingService", () => {
  it("submitContact emails the platform contact address with the submission body", async () => {
    const { svc, sendgrid } = setup();
    await svc.submitContact({ name: "Ada", email: "ada@x.y", company: "Acme", message: "hi" });
    const call = sendgrid.send.mock.calls[0][0];
    expect(call.to).toBe("contact@upriselabs.org");
    expect(call.subject).toContain("Contact form");
    expect(call.body).toContain("Ada");
    expect(call.body).toContain("hi");
  });

  it("requestDemo emails a demo-request subject", async () => {
    const { svc, sendgrid } = setup();
    await svc.requestDemo({ name: "Ada", email: "ada@x.y", useCase: "Texting" });
    const call = sendgrid.send.mock.calls[0][0];
    expect(call.to).toBe("contact@upriselabs.org");
    expect(call.subject).toContain("Demo request");
    expect(call.body).toContain("Texting");
  });

  it("newsletterSignup emails a newsletter-signup notice", async () => {
    const { svc, sendgrid } = setup();
    await svc.newsletterSignup({ email: "ada@x.y" });
    const call = sendgrid.send.mock.calls[0][0];
    expect(call.subject).toContain("Newsletter signup");
    expect(call.body).toContain("ada@x.y");
  });

  it("also sends a branded HTML part, framing each submission line as a paragraph", async () => {
    const { svc, sendgrid } = setup();
    await svc.submitContact({ name: "Ada", email: "ada@x.y", company: "Acme", message: "hi there" });
    const call = sendgrid.send.mock.calls[0][0];
    expect(call.html).toContain("<!doctype html>"); // branded shell
    expect(call.html).toContain("Uprise"); // platform-branded (no tenant)
    expect(call.html).toContain("Name: Ada");
    expect(call.html).toContain("hi there");
    expect(call.html).toContain(call.subject); // heading = subject
  });

  it("degrades to success (no throw) when notify email delivery fails", async () => {
    const { svc, sendgrid } = setup();
    sendgrid.send.mockRejectedValueOnce(new Error("SendGrid is not configured"));
    await expect(svc.newsletterSignup({ email: "ada@x.y" })).resolves.toEqual({ ok: true });
  });
});

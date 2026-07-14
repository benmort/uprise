import { ConfigService } from "@nestjs/config";
import { SendGridProvisioningClient } from "./sendgrid-provisioning.client";

/** Link-branding surface: assert each method's verb/path/body + dns normalisation, with a mocked fetch. */
describe("SendGridProvisioningClient — link branding", () => {
  const creds = { apiKey: "sg-key" };
  const config = { get: (_k: string, fb?: string) => fb ?? "" } as unknown as ConfigService;
  const client = new SendGridProvisioningClient(config);

  let fetchMock: jest.Mock;
  const ok = (body: unknown, status = 200) => ({
    ok: true,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => jest.restoreAllMocks());

  const call = (n = 0) => fetchMock.mock.calls[n] as [string, RequestInit];

  it("listLinkBrandings GETs /v3/whitelabel/links and normalises each row's dns", async () => {
    fetchMock.mockResolvedValue(
      ok([
        {
          id: 42,
          domain: "uprise.org.au",
          subdomain: "email",
          valid: true,
          default: true,
          dns: {
            domain_cname: { host: "email.uprise.org.au", type: "cname", data: "sendgrid.net", valid: true },
            owner_cname: { host: "7654321.uprise.org.au", type: "cname", data: "u1.wl.sendgrid.net", valid: false },
          },
        },
      ]),
    );
    const rows = await client.listLinkBrandings(creds);
    const [url, init] = call();
    expect(url).toBe("https://api.sendgrid.com/v3/whitelabel/links");
    expect(init.method).toBe("GET");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "42", domain: "uprise.org.au", subdomain: "email", valid: true, default: true });
    expect(rows[0].dns).toEqual([
      { record: "domain_cname", host: "email.uprise.org.au", type: "CNAME", data: "sendgrid.net", valid: true },
      { record: "owner_cname", host: "7654321.uprise.org.au", type: "CNAME", data: "u1.wl.sendgrid.net", valid: false },
    ]);
  });

  it("createLinkBranding POSTs domain + subdomain with automatic_security + default", async () => {
    fetchMock.mockResolvedValue(
      ok({ id: 99, domain: "uprise.org.au", subdomain: "email", valid: false, default: true, dns: {} }),
    );
    const res = await client.createLinkBranding(creds, { domain: "uprise.org.au", subdomain: "email" });
    const [url, init] = call();
    expect(url).toBe("https://api.sendgrid.com/v3/whitelabel/links");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      domain: "uprise.org.au",
      subdomain: "email",
      default: true,
      automatic_security: true,
    });
    expect(res).toMatchObject({ id: "99", subdomain: "email", default: true });
    expect(res.dns).toEqual([]); // empty dns object → no records
  });

  it("validateLinkBranding POSTs to /{id}/validate and reports valid + results", async () => {
    fetchMock.mockResolvedValue(ok({ valid: true, validation_results: { domain_cname: { valid: true } } }));
    const res = await client.validateLinkBranding(creds, "99");
    const [url, init] = call();
    expect(url).toBe("https://api.sendgrid.com/v3/whitelabel/links/99/validate");
    expect(init.method).toBe("POST");
    expect(res).toEqual({ valid: true, results: { domain_cname: { valid: true } } });
  });

  it("setDefaultLinkBranding PATCHes /{id} with default:true", async () => {
    fetchMock.mockResolvedValue(ok({ id: 99, domain: "uprise.org.au", default: true }));
    await client.setDefaultLinkBranding(creds, "99");
    const [url, init] = call();
    expect(url).toBe("https://api.sendgrid.com/v3/whitelabel/links/99");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ default: true });
  });

  it("deleteLinkBranding DELETEs /{id} (204, no body)", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204, json: async () => null, text: async () => "" });
    await client.deleteLinkBranding(creds, "42");
    const [url, init] = call();
    expect(url).toBe("https://api.sendgrid.com/v3/whitelabel/links/42");
    expect(init.method).toBe("DELETE");
  });

  it("sends the bearer auth header on every call", async () => {
    fetchMock.mockResolvedValue(ok([]));
    await client.listLinkBrandings(creds);
    const [, init] = call();
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sg-key");
  });
});

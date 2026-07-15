import { readTenantHost } from "./request-host";

describe("readTenantHost", () => {
  it("reads the tenant from the Origin header (the calling app), not the API's own Host", () => {
    expect(
      readTenantHost({
        headers: {
          origin: "https://common-threads.uprise.org.au",
          host: "api.uprise.org.au",
          "x-forwarded-host": "api.uprise.org.au",
        },
      }),
    ).toBe("common-threads.uprise.org.au");
  });

  it("strips the port and lowercases the Origin host", () => {
    expect(readTenantHost({ headers: { origin: "https://Acme.uprise.org.au:443" } })).toBe(
      "acme.uprise.org.au",
    );
  });

  it("takes the first entry of an array Origin header", () => {
    expect(
      readTenantHost({ headers: { origin: ["https://a.uprise.org.au", "https://b"] } }),
    ).toBe("a.uprise.org.au");
  });

  it("falls back to x-forwarded-host then Host when there is no Origin", () => {
    expect(readTenantHost({ headers: { "x-forwarded-host": "acme.uprise.org.au, proxy" } })).toBe(
      "acme.uprise.org.au",
    );
    expect(readTenantHost({ headers: { host: "acme.uprise.org.au" } })).toBe("acme.uprise.org.au");
  });

  it("ignores a malformed Origin and falls back to Host", () => {
    expect(readTenantHost({ headers: { origin: "not a url", host: "admin.uprise.org.au" } })).toBe(
      "admin.uprise.org.au",
    );
  });

  it("returns empty when nothing identifies the host", () => {
    expect(readTenantHost({ headers: {} })).toBe("");
  });
});

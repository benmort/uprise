import { requestMeta } from "./request-meta";

describe("requestMeta", () => {
  it("prefers the first x-forwarded-for hop (the real client behind ngrok/Vercel)", () => {
    const meta = requestMeta({
      headers: { "x-forwarded-for": "203.0.113.7, 172.16.0.1", "user-agent": "TestUA" },
      ip: "127.0.0.1",
    });
    expect(meta).toEqual({ userAgent: "TestUA", ipAddress: "203.0.113.7" });
  });

  it("falls back to x-real-ip, then the socket", () => {
    expect(requestMeta({ headers: { "x-real-ip": "198.51.100.4" } }).ipAddress).toBe("198.51.100.4");
    expect(requestMeta({ headers: {}, socket: { remoteAddress: "10.0.0.9" } }).ipAddress).toBe("10.0.0.9");
  });

  it("normalises IPv4-mapped IPv6 addresses", () => {
    expect(requestMeta({ headers: {}, ip: "::ffff:192.0.2.10" }).ipAddress).toBe("192.0.2.10");
  });

  it("handles missing everything + truncates a huge user agent", () => {
    expect(requestMeta({ headers: {} })).toEqual({ userAgent: null, ipAddress: null });
    const ua = "x".repeat(2000);
    expect(requestMeta({ headers: { "user-agent": ua } }).userAgent).toHaveLength(512);
  });

  it("takes the first value of a repeated header", () => {
    expect(
      requestMeta({ headers: { "x-forwarded-for": ["203.0.113.9", "198.51.100.1"] } }).ipAddress,
    ).toBe("203.0.113.9");
  });
});

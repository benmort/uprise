import { REDACTED, redactContext, redactedContextObject } from "./log-redaction";

describe("redactContext", () => {
  it("leaves the ids that make a log useful alone", () => {
    const context = { syncJobId: "j1", connectionId: "c1", tenantId: "t1", count: 3, ok: true };
    expect(redactContext(context)).toEqual(context);
  });

  it("redacts credential-shaped keys", () => {
    expect(
      redactContext({ apiKey: "sk_live_x", authToken: "abc", password: "hunter2", secretValue: "s" }),
    ).toEqual({
      apiKey: REDACTED,
      authToken: REDACTED,
      password: REDACTED,
      secretValue: REDACTED,
    });
  });

  it("redacts personal data", () => {
    expect(
      redactContext({ phoneE164: "+61400000000", email: "a@b.org", homeAddress: "1 Test St" }),
    ).toEqual({ phoneE164: REDACTED, email: REDACTED, homeAddress: REDACTED });
  });

  // The real risk is a key nobody thought to list, so matching is on substring, not exact name.
  it("catches keys invented later that merely contain a sensitive word", () => {
    expect(redactContext({ twilioAuthToken: "x", userEmailAddress: "y", customerMobile: "z" })).toEqual({
      twilioAuthToken: REDACTED,
      userEmailAddress: REDACTED,
      customerMobile: REDACTED,
    });
  });

  it("is case-insensitive", () => {
    expect(redactContext({ APIKey: "x", Password: "y" })).toEqual({ APIKey: REDACTED, Password: REDACTED });
  });

  it("recurses into nested objects and arrays", () => {
    expect(redactContext({ outer: { inner: { token: "t", id: "keep" } }, list: [{ secret: "s" }] })).toEqual({
      outer: { inner: { token: REDACTED, id: "keep" } },
      list: [{ secret: REDACTED }],
    });
  });

  // Redaction REPLACES rather than drops: knowing a credential was present is diagnostically
  // useful, and a missing key reads as "never set".
  it("keeps the key so the shape survives", () => {
    const out = redactContext({ apiKey: "x" }) as Record<string, unknown>;
    expect(Object.keys(out)).toEqual(["apiKey"]);
  });

  it("survives cycles and very deep objects without throwing", () => {
    const cyclic: Record<string, unknown> = { id: "a" };
    cyclic.self = cyclic;
    expect(() => redactContext(cyclic)).not.toThrow();
    expect(JSON.stringify(redactContext(cyclic))).toContain("truncated");
  });

  it("normalises dates and errors into loggable primitives", () => {
    const out = redactContext({
      when: new Date("2026-08-06T00:00:00.000Z"),
      err: new Error("boom"),
    }) as Record<string, unknown>;
    expect(out.when).toBe("2026-08-06T00:00:00.000Z");
    expect(out.err).toBe("Error: boom");
  });
});

describe("redactedContextObject", () => {
  it("returns undefined for nothing worth storing", () => {
    expect(redactedContextObject(undefined)).toBeUndefined();
    expect(redactedContextObject({})).toBeUndefined();
  });

  it("returns a plain redacted object otherwise", () => {
    expect(redactedContextObject({ id: "x", token: "t" })).toEqual({ id: "x", token: REDACTED });
  });
});

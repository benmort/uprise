import { createSessionToken, verifySessionToken } from "./session-token.util";

describe("actions session tokens", () => {
  const secret = "test-secret";

  it("round-trips a progress token with tenant + subject intact", () => {
    const { token } = createSessionToken(secret, "progress", 60, "t1", "s1");
    const v = verifySessionToken(token, secret, "progress");
    expect(v).toEqual({ ok: true, tenantId: "t1", subjectId: "s1" });
  });

  it("binds the purpose into the signature — a preview token never opens a stream", () => {
    const { token } = createSessionToken(secret, "preview", 60, "t1", "page1");
    expect(verifySessionToken(token, secret, "progress")).toMatchObject({ ok: false, reason: "wrong_purpose" });
  });

  it("rejects expiry, tamper and wrong secret", () => {
    const { token } = createSessionToken(secret, "progress", -1, "t1", "s1");
    expect(verifySessionToken(token, secret, "progress")).toMatchObject({ ok: false, reason: "expired" });

    const good = createSessionToken(secret, "progress", 60, "t1", "s1").token;
    const decoded = Buffer.from(good, "base64url").toString("utf8").replace(".t1.", ".t2.");
    const tampered = Buffer.from(decoded, "utf8").toString("base64url");
    expect(verifySessionToken(tampered, secret, "progress").ok).toBe(false);

    expect(verifySessionToken(good, "other-secret", "progress")).toMatchObject({
      ok: false,
      reason: "invalid_signature",
    });
    expect(verifySessionToken("", secret, "progress")).toMatchObject({ ok: false, reason: "missing_token" });
  });
});

import { createStreamToken, verifyStreamTokenDetailed } from "./stream-token";

const SECRET = "test-stream-secret";

describe("stream-token", () => {
  it("round-trips the tenantId of a valid token", () => {
    const { token } = createStreamToken(SECRET, 300, "tenant-a");
    const result = verifyStreamTokenDetailed(token, SECRET);
    expect(result).toEqual({ ok: true, tenantId: "tenant-a" });
  });

  it("does not verify a token signed for a different tenant against a tampered payload", () => {
    // Take a valid token, swap the embedded tenantId — signature no longer matches.
    const { token } = createStreamToken(SECRET, 300, "tenant-a");
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [expiresAt, nonce, , signature] = decoded.split(".");
    const forged = Buffer.from(`${expiresAt}.${nonce}.tenant-b.${signature}`, "utf8").toString("base64url");
    expect(verifyStreamTokenDetailed(forged, SECRET)).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("rejects a token signed with a different secret", () => {
    const { token } = createStreamToken("other-secret", 300, "tenant-a");
    expect(verifyStreamTokenDetailed(token, SECRET)).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("rejects an expired token", () => {
    const { token } = createStreamToken(SECRET, -1, "tenant-a");
    expect(verifyStreamTokenDetailed(token, SECRET)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a legacy 3-part token with no tenantId", () => {
    const legacy = Buffer.from(`${Date.now() + 10000}.nonce.sig`, "utf8").toString("base64url");
    expect(verifyStreamTokenDetailed(legacy, SECRET)).toEqual({ ok: false, reason: "invalid_payload" });
  });

  it("flags a missing token / secret", () => {
    expect(verifyStreamTokenDetailed("", SECRET)).toEqual({ ok: false, reason: "missing_token" });
    const { token } = createStreamToken(SECRET, 300, "tenant-a");
    expect(verifyStreamTokenDetailed(token, "")).toEqual({ ok: false, reason: "missing_secret" });
  });
});

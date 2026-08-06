import { CredentialCryptoService, CredentialDecryptionError } from "./credential-crypto.service";

/** A ConfigService stub returning a fixed INTEGRATION_CREDENTIAL_SECRET. */
const svc = (secret = "unit-test-secret") =>
  new CredentialCryptoService({ get: () => secret } as never);

describe("CredentialCryptoService", () => {
  it("round-trips a string (encrypt → decrypt)", () => {
    const s = svc();
    expect(s.decrypt(s.encrypt("hunter2"))).toBe("hunter2");
  });

  it("round-trips empty and unicode payloads", () => {
    const s = svc();
    expect(s.decrypt(s.encrypt(""))).toBe("");
    expect(s.decrypt(s.encrypt("café · 🎉 · \n"))).toBe("café · 🎉 · \n");
  });

  it("uses a fresh IV each time — same input yields different ciphertext, both decryptable", () => {
    const s = svc();
    const a = s.encrypt("same");
    const b = s.encrypt("same");
    expect(a).not.toBe(b); // random 12-byte IV
    expect(s.decrypt(a)).toBe("same");
    expect(s.decrypt(b)).toBe("same");
  });

  it("rejects tampered ciphertext (GCM auth tag)", () => {
    const s = svc();
    const buf = Buffer.from(s.encrypt("secret"), "base64");
    buf[buf.length - 1] ^= 0xff; // flip a payload byte
    expect(() => s.decrypt(buf.toString("base64"))).toThrow();
  });

  it("cannot be decrypted with a different secret", () => {
    const a = svc("secret-a");
    const b = svc("secret-b");
    expect(() => b.decrypt(a.encrypt("cross"))).toThrow();
  });

  // A drifted secret used to surface only as Node's "Unsupported state or unable to
  // authenticate data" from the GCM tag check — a message that names neither the env
  // var nor the fix, and which callers had no type to branch on.
  it("raises CredentialDecryptionError naming the secret, not a raw GCM message", () => {
    const a = svc("api-side-secret");
    const b = svc("worker-side-secret");
    let caught: unknown;
    try {
      b.decrypt(a.encrypt("an-api-key"));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CredentialDecryptionError);
    expect((caught as Error).message).toContain("INTEGRATION_CREDENTIAL_SECRET");
    // The underlying crypto failure is kept as the cause, not swallowed.
    expect(String((caught as CredentialDecryptionError).cause)).toMatch(/unable to authenticate data/i);
  });

  it("raises CredentialDecryptionError on malformed (non-ciphertext) input", () => {
    expect(() => svc().decrypt("not-base64-ciphertext")).toThrow(CredentialDecryptionError);
  });
});

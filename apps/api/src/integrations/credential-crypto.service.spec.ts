import { CredentialCryptoService } from "./credential-crypto.service";

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
});

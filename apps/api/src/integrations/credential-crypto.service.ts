import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * A stored credential could not be decrypted with this process's
 * INTEGRATION_CREDENTIAL_SECRET.
 *
 * The key is `sha256(secret)`, so a secret that differs by one character still
 * yields a well-formed 32-byte key and the failure lands on the GCM auth tag as
 * `Unsupported state or unable to authenticate data` – a message that says
 * nothing about the cause. In practice the cause is almost always **drift**: the
 * Vercel API encrypted the credential with one secret and the Railway worker
 * tried to decrypt it with another (see `dev/ai/how-to/railway-ops.md` – the two
 * deploys must share this value). It is a permanent failure: no amount of
 * retrying makes the key match, so callers should fail the work rather than
 * queue it for backoff.
 */
export class CredentialDecryptionError extends Error {
  /** Declared rather than inherited: the api tsconfig lib predates ES2022's `Error.cause`. */
  readonly cause?: unknown;

  constructor(cause?: unknown) {
    super(
      "Stored credential could not be decrypted with this process's INTEGRATION_CREDENTIAL_SECRET " +
        "(it does not match the secret the credential was encrypted with). The API and the worker " +
        "must share the same value; align them, then reconnect the integration.",
    );
    this.name = "CredentialDecryptionError";
    this.cause = cause;
  }
}

@Injectable()
export class CredentialCryptoService {
  constructor(private readonly config: ConfigService) {}

  private getKey(): Buffer {
    const secret = this.config.get<string>("INTEGRATION_CREDENTIAL_SECRET", "");
    return createHash("sha256").update(secret).digest();
  }

  encrypt(raw: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString("base64");
  }

  decrypt(encoded: string): string {
    try {
      const blob = Buffer.from(encoded, "base64");
      const iv = blob.subarray(0, 12);
      const tag = blob.subarray(12, 28);
      const payload = blob.subarray(28);
      const decipher = createDecipheriv("aes-256-gcm", this.getKey(), iv);
      decipher.setAuthTag(tag);
      const clear = Buffer.concat([decipher.update(payload), decipher.final()]);
      return clear.toString("utf8");
    } catch (error) {
      throw new CredentialDecryptionError(error);
    }
  }
}

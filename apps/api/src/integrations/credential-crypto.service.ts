import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

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
    const blob = Buffer.from(encoded, "base64");
    const iv = blob.subarray(0, 12);
    const tag = blob.subarray(12, 28);
    const payload = blob.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.getKey(), iv);
    decipher.setAuthTag(tag);
    const clear = Buffer.concat([decipher.update(payload), decipher.final()]);
    return clear.toString("utf8");
  }
}

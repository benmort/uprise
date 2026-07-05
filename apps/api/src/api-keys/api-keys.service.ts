import { Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import { Prisma } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { CreateApiKeyDto } from "./dto/api-keys.dto";

// Public-safe projection — never expose keyHash.
const SAFE_SELECT = {
  id: true,
  name: true,
  prefix: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ApiKeySelect;

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  /** Active (non-revoked) keys, newest first. Never returns the hash or plaintext. */
  async list(tenantId: string) {
    return this.prisma.apiKey.findMany({
      where: { tenantId, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: SAFE_SELECT,
    });
  }

  /**
   * Mint a key: the plaintext is generated server-side, returned ONCE, and only its
   * SHA-256 hash is stored. `prefix` is a non-secret display fragment.
   */
  async issue(tenantId: string, input: CreateApiKeyDto) {
    const secret = randomBytes(24).toString("hex");
    const plaintext = `yk_${secret}`;
    const prefix = `${plaintext.slice(0, 11)}…`;
    const keyHash = createHash("sha256").update(plaintext).digest("hex");

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.apiKey.create({
        data: { tenantId, name: input.name, prefix, keyHash },
        select: SAFE_SELECT,
      });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "tenant.api-key.issued",
        aggregateId: row.id,
        payload: { apiKeyId: row.id, tenantId, name: row.name },
      });
      return row;
    });

    // Plaintext is surfaced exactly once, at creation.
    return { ...created, key: plaintext };
  }

  /** Revoke a key (soft — sets revokedAt). Idempotent for an already-revoked key. */
  async revoke(tenantId: string, id: string) {
    const existing = await this.prisma.apiKey.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("API key not found");

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.apiKey.update({
        where: { id },
        data: { revokedAt: existing.revokedAt ?? new Date() },
        select: SAFE_SELECT,
      });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "tenant.api-key.revoked",
        aggregateId: row.id,
        payload: { apiKeyId: row.id, tenantId },
      });
      return row;
    });
  }
}

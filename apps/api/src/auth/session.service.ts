import { randomBytes } from "crypto";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** Default session lifetime: 12 hours (matches the analytics stream-token TTL default). */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface ResolvedSession {
  userId: string;
  email: string;
  tenantId: string | null;
  role: string; // AppUserRole value from the membership
}

/**
 * Opaque session tokens backed by iam.Session (meld doc 03). The token is a
 * random 256-bit string stored verbatim; sessions expire and are deleted on
 * logout. This backs the standalone auth frontend (doc 14) — the API issues an
 * httpOnly cookie; other apps redirect to the auth app and share it.
 */
@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, ttlMs: number = SESSION_TTL_MS): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + ttlMs);
    await this.prisma.session.create({ data: { userId, token, expiresAt } });
    return { token, expiresAt };
  }

  /** Resolve a session token to its actor (user identity + tenant membership), or null. */
  async resolve(token: string): Promise<ResolvedSession | null> {
    if (!token) return null;
    const session = await this.prisma.session.findUnique({ where: { token } });
    if (!session || session.expiresAt.getTime() <= Date.now()) return null;
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) return null;
    const membership = await this.prisma.tenantMember.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) return null;
    return { userId: user.id, email: user.email, tenantId: membership.tenantId, role: membership.role };
  }

  async revoke(token: string): Promise<void> {
    if (!token) return;
    await this.prisma.session.deleteMany({ where: { token } });
  }
}

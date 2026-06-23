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

  async create(
    userId: string,
    opts: { tenantId?: string | null; ttlMs?: number } = {},
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + (opts.ttlMs ?? SESSION_TTL_MS));
    await this.prisma.session.create({
      data: { userId, token, expiresAt, tenantId: opts.tenantId ?? null },
    });
    // Sign-in audit (WS3) — every login path funnels through here.
    await this.prisma.user.update({ where: { id: userId }, data: { lastSignInAt: new Date() } }).catch(() => undefined);
    return { token, expiresAt };
  }

  /**
   * Resolve a session token to its actor. The active tenant is the session's
   * pinned tenant (set via select-tenant) if it's still a valid membership,
   * else the user's earliest membership.
   */
  async resolve(token: string): Promise<ResolvedSession | null> {
    if (!token) return null;
    const session = await this.prisma.session.findUnique({ where: { token } });
    if (!session || session.expiresAt.getTime() <= Date.now()) return null;
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) return null;
    const memberships = await this.prisma.tenantMember.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    if (memberships.length === 0) return null;
    const active =
      (session.tenantId && memberships.find((m) => m.tenantId === session.tenantId)) ||
      memberships[0];
    return { userId: user.id, email: user.email, tenantId: active.tenantId, role: active.role };
  }

  /** Pin the active tenant on a session (select-tenant). No-op if the token is unknown. */
  async setTenant(token: string, tenantId: string): Promise<void> {
    if (!token) return;
    await this.prisma.session.updateMany({ where: { token }, data: { tenantId } });
  }

  async revoke(token: string): Promise<void> {
    if (!token) return;
    await this.prisma.session.deleteMany({ where: { token } });
  }

  /** Revoke every session for a user (e.g. after a password reset). */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }
}

import { randomBytes } from "crypto";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** Default session lifetime: 12 hours (matches the analytics stream-token TTL default). */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface ResolvedSession {
  userId: string;
  email: string;
  tenantId: string | null;
  role: string; // AppUserRole value from the membership (effective OWNER for a membership-less super-admin)
  isSuperAdmin: boolean;
  /**
   * Set when a host-forced tenant (a tenant subdomain / white-label host) was requested
   * but this user is neither a member nor a super-admin. The session itself is valid — the
   * caller just has no access to THIS workspace — so the guard turns it into a 403, not a 401.
   */
  hostTenantDenied?: boolean;
}

export interface SessionSummary {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
  current: boolean;
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
   * Stamp the login device (IP + user agent) onto a just-issued session — the
   * controllers call this right after the grant so the flows layer stays
   * request-agnostic. Best-effort: a failed stamp must never fail a login.
   */
  async stampLoginMeta(
    token: string,
    meta: { userAgent?: string | null; ipAddress?: string | null },
  ): Promise<void> {
    await this.prisma.session
      .update({
        where: { token },
        data: {
          userAgent: meta.userAgent ?? null,
          ipAddress: meta.ipAddress ?? null,
          lastSeenAt: new Date(),
        },
      })
      .catch(() => undefined);
  }

  /**
   * Resolve a session token to its actor. The active tenant is the session's
   * pinned tenant (set via select-tenant) if it's still a valid membership,
   * else the user's earliest membership.
   */
  async resolve(
    token: string,
    meta?: { userAgent?: string | null; ipAddress?: string | null },
    opts?: { forcedTenantId?: string | null },
  ): Promise<ResolvedSession | null> {
    if (!token) return null;
    const session = await this.prisma.session.findUnique({ where: { token } });
    if (!session || session.expiresAt.getTime() <= Date.now()) return null;
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.deletedAt) return null;
    // Stamp device info + last-seen on activity, best-effort. The user agent is
    // first-write (it identifies the device the session was minted on); the IP
    // is latest-wins so the active-sessions list shows the last-known address.
    void this.prisma.session
      .update({
        where: { id: session.id },
        data: {
          lastSeenAt: new Date(),
          userAgent: session.userAgent ?? meta?.userAgent ?? null,
          ipAddress: meta?.ipAddress ?? session.ipAddress ?? null,
        },
      })
      .catch(() => undefined);
    const memberships = await this.prisma.tenantMember.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    // A super-admin may have zero memberships (break-glass) and may operate inside a
    // tenant they're not a member of — so they resolve even when a normal user wouldn't.
    if (memberships.length === 0 && !user.isSuperAdmin) return null;
    const isSuperAdmin = user.isSuperAdmin === true;

    // Host-forced tenant (subdomain / white-label host) — takes precedence over the
    // session's pinned tenant so the URL's tenant is what a request acts on. A member
    // uses their real role; a super-admin acts-as (effective OWNER); anyone else is
    // denied THIS workspace (the guard 403s) without invalidating their session.
    const forcedTenantId = opts?.forcedTenantId ?? null;
    if (forcedTenantId) {
      const forcedMembership = memberships.find((m) => m.tenantId === forcedTenantId);
      if (forcedMembership) {
        return {
          userId: user.id,
          email: user.email,
          tenantId: forcedTenantId,
          role: forcedMembership.role,
          isSuperAdmin,
        };
      }
      if (isSuperAdmin) {
        return { userId: user.id, email: user.email, tenantId: forcedTenantId, role: "OWNER", isSuperAdmin };
      }
      return {
        userId: user.id,
        email: user.email,
        tenantId: null,
        role: memberships[0]?.role ?? "member",
        isSuperAdmin,
        hostTenantDenied: true,
      };
    }

    const pinned = session.tenantId
      ? memberships.find((m) => m.tenantId === session.tenantId)
      : undefined;
    let tenantId: string | null;
    let role: string;
    if (pinned) {
      tenantId = pinned.tenantId;
      role = pinned.role;
    } else if (user.isSuperAdmin) {
      // Pinned tenant (even without a membership there) wins; else first membership; else none.
      tenantId = session.tenantId ?? memberships[0]?.tenantId ?? null;
      role = memberships.find((m) => m.tenantId === tenantId)?.role ?? "OWNER";
    } else {
      tenantId = memberships[0].tenantId;
      role = memberships[0].role;
    }
    return { userId: user.id, email: user.email, tenantId, role, isSuperAdmin: user.isSuperAdmin === true };
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

  /** Active (unexpired) sessions for a user, newest activity first; flags the current one. */
  async listForUser(userId: string, currentToken: string): Promise<SessionSummary[]> {
    const rows = await this.prisma.session.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
    });
    return rows.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      lastSeenAt: s.lastSeenAt,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      current: s.token === currentToken,
    }));
  }

  /** Revoke one session by id, scoped to the owner (can't touch another user's). */
  async revokeById(userId: string, sessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: sessionId, userId } });
  }

  /** Sign out everywhere except the caller's current session. */
  async revokeOthers(userId: string, currentToken: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId, token: { not: currentToken } } });
  }
}

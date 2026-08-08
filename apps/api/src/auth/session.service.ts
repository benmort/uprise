import { randomBytes } from "crypto";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** Default session lifetime: 24 hours — a full day so a canvasser's session doesn't drop
 *  mid-shift. Applies to every role (volunteer/organiser/owner/super-admin); absolute from
 *  login, not sliding. */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

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
/**
 * How long a resolved principal may be reused. Deliberately seconds, not minutes.
 *
 * This exists to collapse a BURST — a map firing twenty tile requests, a dashboard opening eight
 * panels at once — into one principal build, not to keep sessions warm. The window is the cost:
 * an explicitly revoked session is evicted immediately (see `evict`), but a change made straight
 * in the database, or a membership edited elsewhere, is honoured up to this late.
 *
 * Set OPS_SESSION_CACHE_MS=0 to switch it off entirely.
 */
const SESSION_CACHE_MS = 5_000;

/** Bound on the cache — a shared server must not accumulate principals without limit. */
const SESSION_CACHE_MAX = 500;

@Injectable()
export class SessionService {
  /**
   * token → the principal it resolved to, with the moment it was cached.
   *
   * Per-process, so on Vercel each lambda keeps its own; that is fine for the burst this targets
   * (a burst lands on one lambda) and it means nothing to invalidate across instances beyond the
   * TTL. Nulls are NOT cached: a failed resolve is cheap and caching it would keep a just-signed-in
   * user locked out for the window.
   */
  private readonly resolved = new Map<string, { at: number; value: ResolvedSession }>();

  /**
   * Resolves currently in flight, keyed by token.
   *
   * A result cache alone does NOT fix the case this exists for. Twenty tile requests arrive
   * together, so all twenty start before any finishes and every one of them misses — which is
   * exactly the burst that drained the pool. Sharing the in-flight promise is what collapses
   * concurrent callers onto one principal build; the result cache then covers the requests that
   * follow it.
   */
  private readonly inflight = new Map<string, Promise<ResolvedSession | null>>();

  constructor(private readonly prisma: PrismaService) {}

  private get cacheMs(): number {
    const raw = Number(process.env.OPS_SESSION_CACHE_MS ?? SESSION_CACHE_MS);
    return Number.isFinite(raw) && raw >= 0 ? raw : SESSION_CACHE_MS;
  }

  /**
   * Drop a token's cached principal. Called from every revoke path, so signing out takes effect
   * immediately rather than after the TTL — which is the revocation people actually perform.
   */
  private evict(token?: string | null): void {
    if (token) {
      this.resolved.delete(token);
      this.inflight.delete(token);
    } else {
      this.resolved.clear();
      this.inflight.clear();
    }
  }

  /** Test seam + the "revoked by user id" paths, which do not know the tokens involved. */
  private evictAll(): void {
    this.resolved.clear();
    this.inflight.clear();
  }

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
   * Is this token a live session? One indexed lookup, nothing else.
   *
   * `resolve` costs two round-trips – the session, then the user + memberships in parallel – plus
   * a last-seen write, because it builds a full principal with a role and an active tenant. Routes
   * that serve static reference data need none of that: they need to know the caller is signed in.
   * Paying for a principal you discard is how a map's tile burst drained the connection pool and
   * 500'd 22 requests in eight seconds.
   *
   * Deliberately returns no role and no tenant, so it cannot accidentally satisfy a `@Roles` or
   * `@RequirePermission` gate — a route using this must genuinely need neither.
   */
  async resolveLight(token: string): Promise<{ userId: string } | null> {
    if (!token) return null;
    const session = await this.prisma.session.findUnique({
      where: { token },
      select: { userId: true, expiresAt: true },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) return null;
    return { userId: session.userId };
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
    // A host-forced tenant changes what the principal RESOLVES TO, so it must never read a
    // principal cached for the unforced request (or vice versa). Those skip the cache entirely
    // rather than complicate the key — they are a page load, not a burst.
    const cacheable = this.cacheMs > 0 && !opts?.forcedTenantId;
    if (cacheable) {
      const hit = this.resolved.get(token);
      if (hit && Date.now() - hit.at < this.cacheMs) return hit.value;
      if (hit) this.resolved.delete(token);
    }
    // Join a resolve already running for this token rather than starting a second one.
    const running = cacheable ? this.inflight.get(token) : undefined;
    if (running) return running;

    const pending = this.resolveUncached(token, meta, opts);
    if (cacheable) this.inflight.set(token, pending);
    let value: ResolvedSession | null;
    try {
      value = await pending;
    } finally {
      if (cacheable) this.inflight.delete(token);
    }
    // Only successes are cached. A null is cheap to recompute, and caching it would lock out a
    // user whose session became valid a moment ago.
    if (cacheable && value) {
      if (this.resolved.size >= SESSION_CACHE_MAX) {
        // Oldest insertion first — Map preserves insertion order, so this drops the stalest.
        const oldest = this.resolved.keys().next().value;
        if (oldest !== undefined) this.resolved.delete(oldest);
      }
      this.resolved.set(token, { at: Date.now(), value });
    }
    return value;
  }

  /** The real principal build – two round-trips and a last-seen stamp. Wrapped by `resolve`. */
  private async resolveUncached(
    token: string,
    meta?: { userAgent?: string | null; ipAddress?: string | null },
    opts?: { forcedTenantId?: string | null },
  ): Promise<ResolvedSession | null> {
    const session = await this.prisma.session.findUnique({
      where: { token },
      // Exactly what the principal build + the last-seen stamp below read off the row.
      select: {
        id: true,
        userId: true,
        tenantId: true,
        expiresAt: true,
        userAgent: true,
        ipAddress: true,
      },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) return null;
    // The user row and the membership list are both keyed off session.userId and independent of
    // each other – fetch them together, so the hottest path in the API pays one round-trip here,
    // not two. The soft-delete guard stays in-memory below, exactly as before. Selects are narrow:
    // exactly the fields the principal (and the stamp above) uses.
    const [user, memberships] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: session.userId },
        select: { id: true, email: true, deletedAt: true, isSuperAdmin: true },
      }),
      this.prisma.tenantMember.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: "asc" },
        select: { tenantId: true, role: true },
      }),
    ]);
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
    this.evict(token);
    await this.prisma.session.deleteMany({ where: { token } });
  }

  /** Revoke every session for a user (e.g. after a password reset). */
  async revokeAllForUser(userId: string): Promise<void> {
    // Token-keyed cache, user-keyed revoke — clear it rather than leave a signed-out principal
    // usable. This runs after a password reset, where being late is the whole problem.
    this.evictAll();
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
    this.evictAll();
    await this.prisma.session.deleteMany({ where: { id: sessionId, userId } });
  }

  /** Sign out everywhere except the caller's current session. */
  async revokeOthers(userId: string, currentToken: string): Promise<void> {
    this.evictAll();
    await this.prisma.session.deleteMany({ where: { userId, token: { not: currentToken } } });
  }
}

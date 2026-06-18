import { Injectable, Logger } from "@nestjs/common";
import { HttpStatus } from "@nestjs/common";
import {
  AppUserRole,
  EngagementChannel,
  Prisma,
  SupportLevel,
  TurfAssignmentStatus,
  WalkListItemListType,
  WalkListItemStatus,
} from "../../src/generated/prisma";
import { put } from "@vercel/blob";
import { PrismaService } from "../prisma/prisma.service";
import { ApiHttpException } from "../common/http/api-response";
import { pointInGeometry, type LngLat } from "../common/utils/geo.utils";
import { hashPassword } from "../auth/password.util";
import { EngagementService } from "../shared-engagement/engagement.service";

const SUPPORT_LEVELS: SupportLevel[] = [
  SupportLevel.STRONG_SUPPORT,
  SupportLevel.LEAN_SUPPORT,
  SupportLevel.UNDECIDED,
  SupportLevel.LEAN_OPPOSE,
  SupportLevel.STRONG_OPPOSE,
];

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export type RecordDoorKnockInput = {
  contactId: string;
  canvasserId: string;
  localId: string;
  dispositionCode?: string | null;
  lat?: number | null;
  lng?: number | null;
  notes?: string | null;
  clientCapturedAt?: string | null;
  walkListItemId?: string | null;
  photoUrl?: string | null;
  safetyFlag?: boolean | null;
};

@Injectable()
export class CanvassingService {
  private readonly logger = new Logger(CanvassingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engagement: EngagementService,
  ) {}

  // ── Turf assignment (server-owned lock) ─────────────────────────
  /**
   * Claim a turf for a canvasser. The partial unique index
   * (TurfAssignment_one_active_per_turf) guarantees at most one ASSIGNED row per
   * turf, so a second claimant gets a 409 rather than a silent double-assignment.
   */
  async assignTurf(
    organizationId: string,
    turfId: string,
    canvasserId: string,
    lockedUntil?: Date,
  ) {
    const turf = await this.prisma.turf.findFirst({ where: { id: turfId, organizationId } });
    if (!turf) throw new ApiHttpException("TURF_NOT_FOUND", "Turf not found");

    try {
      return await this.prisma.turfAssignment.create({
        data: { turfId, canvasserId, status: TurfAssignmentStatus.ASSIGNED, lockedUntil },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const current = await this.prisma.turfAssignment.findFirst({
          where: { turfId, status: TurfAssignmentStatus.ASSIGNED },
        });
        if (current?.canvasserId === canvasserId) return current; // idempotent re-claim
        throw new ApiHttpException("TURF_LOCKED", "This turf is already assigned to another canvasser");
      }
      throw error;
    }
  }

  async releaseTurf(organizationId: string, turfId: string, canvasserId: string) {
    const turf = await this.prisma.turf.findFirst({ where: { id: turfId, organizationId } });
    if (!turf) throw new ApiHttpException("TURF_NOT_FOUND", "Turf not found");
    return this.prisma.turfAssignment.updateMany({
      where: { turfId, canvasserId, status: TurfAssignmentStatus.ASSIGNED },
      data: { status: TurfAssignmentStatus.RELEASED, releasedAt: new Date() },
    });
  }

  /** The turfs (and their walk lists) currently locked to a canvasser. */
  async listAssignments(organizationId: string, canvasserId: string) {
    const assignments = await this.prisma.turfAssignment.findMany({
      where: { canvasserId, status: TurfAssignmentStatus.ASSIGNED, turf: { organizationId } },
      include: {
        turf: {
          include: { walkLists: { include: { items: { orderBy: { orderIndex: "asc" }, include: { contact: true } } } } },
        },
      },
    });
    return assignments.map((a) => ({
      turfId: a.turfId,
      lockedUntil: a.lockedUntil,
      turf: { id: a.turf.id, name: a.turf.name, geometry: a.turf.geometry },
      walkLists: a.turf.walkLists,
    }));
  }

  // ── Door knocks (idempotent + lock-enforced) ────────────────────
  /**
   * Record a door knock. Idempotent on (org, localId) so a re-synced offline
   * knock is deduped. Enforces the turf lock: a canvasser can only knock a
   * contact whose turf is currently assigned to them (else 409). When a
   * disposition is given it's recorded through the shared engagement layer, so
   * it lands on the contact timeline AND fires journey triggers.
   */
  /**
   * Upload a door-knock photo to blob storage and return its public URL (stored on
   * DoorKnock.photoUrl). Gated on BLOB_READ_WRITE_TOKEN so it degrades clearly when
   * storage isn't configured.
   */
  async uploadDoorPhoto(file?: { buffer?: Buffer; originalname?: string; mimetype?: string }) {
    if (!file?.buffer) throw new ApiHttpException("NO_FILE", "No photo provided");
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      throw new ApiHttpException("PHOTO_STORAGE_NOT_CONFIGURED", "Photo storage is not configured");
    }
    const ext = (file.originalname?.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = `door-knocks/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext || "jpg"}`;
    const { url } = await put(key, file.buffer, {
      access: "public",
      token,
      contentType: file.mimetype,
    });
    return { url };
  }

  /** Create a household/resident at the door (cold "addresses without contacts" universe). */
  async createDoorContact(
    organizationId: string,
    input: {
      canvasserId: string;
      turfId: string;
      firstName?: string;
      lastName?: string;
      address?: string;
      phoneE164?: string;
      lat?: number;
      lng?: number;
    },
  ) {
    // The canvasser must hold this turf's lock to add to it.
    const lock = await this.prisma.turfAssignment.findFirst({
      where: { turfId: input.turfId, status: TurfAssignmentStatus.ASSIGNED, turf: { organizationId } },
    });
    if (!lock || lock.canvasserId !== input.canvasserId) {
      throw new ApiHttpException("TURF_NOT_ASSIGNED", "This turf is not assigned to you");
    }
    return this.prisma.contact.create({
      data: {
        organizationId,
        turfId: input.turfId,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        address: input.address ?? null,
        phoneE164: input.phoneE164 ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
      },
      select: { id: true, firstName: true, lastName: true, address: true },
    });
  }

  async recordDoorKnock(organizationId: string, input: RecordDoorKnockInput) {
    const existing = await this.prisma.doorKnock.findUnique({
      where: { organizationId_localId: { organizationId, localId: input.localId } },
    });
    if (existing) return existing; // idempotent replay

    await this.assertCanvasserOwnsContactTurf(organizationId, input.contactId, input.canvasserId);

    const knock = await this.prisma.doorKnock.create({
      data: {
        organizationId,
        contactId: input.contactId,
        canvasserId: input.canvasserId,
        walkListItemId: input.walkListItemId ?? null,
        localId: input.localId,
        dispositionCode: input.dispositionCode ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        notes: input.notes ?? null,
        photoUrl: input.photoUrl ?? null,
        safetyFlag: input.safetyFlag ?? null,
        clientCapturedAt: input.clientCapturedAt ? new Date(input.clientCapturedAt) : null,
      },
    });

    if (input.walkListItemId) {
      await this.prisma.walkListItem.updateMany({
        where: { id: input.walkListItemId },
        data: { status: WalkListItemStatus.VISITED },
      });
    }

    if (input.dispositionCode) {
      await this.engagement.recordDisposition(organizationId, {
        contactId: input.contactId,
        code: input.dispositionCode,
        channel: EngagementChannel.DOOR,
        recordedById: input.canvasserId,
      });
    }

    return knock;
  }

  private async assertCanvasserOwnsContactTurf(
    organizationId: string,
    contactId: string,
    canvasserId: string,
  ): Promise<void> {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, organizationId },
      select: { turfId: true },
    });
    if (!contact) throw new ApiHttpException("CONTACT_NOT_FOUND", "Contact not found");
    if (!contact.turfId) return; // contact not in any turf — no lock to enforce

    const lock = await this.prisma.turfAssignment.findFirst({
      where: { turfId: contact.turfId, status: TurfAssignmentStatus.ASSIGNED },
    });
    if (!lock || lock.canvasserId !== canvasserId) {
      throw new ApiHttpException(
        "TURF_NOT_ASSIGNED",
        "This contact's turf is not assigned to you",
      );
    }
  }

  /** Canvassers (and organisers) available for turf assignment. */
  async listCanvassers(organizationId: string) {
    const users = await this.prisma.appUser.findMany({
      where: { organizationId },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true, email: true, role: true },
    });
    return users;
  }

  /**
   * Provision a field login: create an AppUser with a hashed password. Used by
   * the canvasser-management invite flow. Email is unique; a clash returns 409.
   */
  async createCanvasser(
    organizationId: string,
    input: { displayName: string; email: string; password: string; role?: AppUserRole },
  ) {
    const passwordHash = await hashPassword(input.password);
    try {
      const user = await this.prisma.appUser.create({
        data: {
          organizationId,
          displayName: input.displayName,
          email: input.email.toLowerCase(),
          passwordHash,
          role: input.role ?? AppUserRole.CANVASSER,
        },
        select: { id: true, displayName: true, email: true, role: true },
      });
      return user;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ApiHttpException("EMAIL_TAKEN", "A user with that email already exists");
      }
      throw error;
    }
  }

  /** Contacts that fall in a turf, route-orderable for a walk list. */
  async listTurfContacts(organizationId: string, turfId: string) {
    return this.prisma.contact.findMany({
      where: { organizationId, turfId },
      orderBy: { createdAt: "asc" },
      select: { id: true, firstName: true, lastName: true, address: true, lat: true, lng: true },
    });
  }

  // ── Authoring (organiser) ───────────────────────────────────────
  /** Turfs for an org with their active assignment + door counts. */
  async listTurfs(organizationId: string, campaignId?: string) {
    const turfs = await this.prisma.turf.findMany({
      where: { organizationId, ...(campaignId ? { campaignId } : {}) },
      orderBy: { createdAt: "desc" },
      include: {
        assignments: { where: { status: TurfAssignmentStatus.ASSIGNED }, include: { canvasser: true } },
        _count: { select: { contacts: true, walkLists: true } },
        walkLists: { select: { items: { select: { status: true } } } },
      },
    });
    return turfs.map((t) => {
      const items = t.walkLists.flatMap((w) => w.items);
      const totalStops = items.length;
      const visitedStops = items.filter((i) => i.status === WalkListItemStatus.VISITED).length;
      return {
        id: t.id,
        name: t.name,
        campaignId: t.campaignId,
        geometry: t.geometry,
        contactCount: t._count.contacts,
        walkListCount: t._count.walkLists,
        totalStops,
        visitedStops,
        assignedTo: t.assignments[0]
          ? { canvasserId: t.assignments[0].canvasserId, name: t.assignments[0].canvasser.displayName }
          : null,
      };
    });
  }

  async createTurf(organizationId: string, input: { name: string; geometry: unknown; campaignId?: string | null }) {
    return this.prisma.turf.create({
      data: {
        organizationId,
        name: input.name,
        geometry: input.geometry as Prisma.InputJsonValue,
        campaignId: input.campaignId ?? null,
      },
    });
  }

  async createWalkList(
    organizationId: string,
    input: {
      name: string;
      turfId?: string | null;
      campaignId?: string | null;
      contactIds: string[];
      listType?: WalkListItemListType;
    },
  ) {
    return this.prisma.walkList.create({
      data: {
        organizationId,
        name: input.name,
        turfId: input.turfId ?? null,
        campaignId: input.campaignId ?? null,
        listType: input.listType ?? WalkListItemListType.STATIC,
        items: {
          create: input.contactIds.map((contactId, orderIndex) => ({ contactId, orderIndex })),
        },
      },
      include: { items: { orderBy: { orderIndex: "asc" } } },
    });
  }

  /** Rename / reshape a turf boundary. Geometry changes don't auto-rebucket. */
  async updateTurf(
    organizationId: string,
    turfId: string,
    input: { name?: string; geometry?: unknown },
  ) {
    const turf = await this.prisma.turf.findFirst({ where: { id: turfId, organizationId } });
    if (!turf) throw new ApiHttpException("TURF_NOT_FOUND", "Turf not found");
    const data: Prisma.TurfUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.geometry !== undefined) data.geometry = input.geometry as Prisma.InputJsonValue;
    return this.prisma.turf.update({ where: { id: turfId }, data });
  }

  /**
   * Re-bucket contacts against a turf's current boundary: claim every
   * geocoded org contact that now falls inside, and release contacts
   * previously in this turf that fall outside. Point-in-polygon runs in-process
   * via the shared geo util (GeoJSON [lng, lat] order). Returns the deltas.
   */
  async rebucketTurf(organizationId: string, turfId: string) {
    const turf = await this.prisma.turf.findFirst({ where: { id: turfId, organizationId } });
    if (!turf) throw new ApiHttpException("TURF_NOT_FOUND", "Turf not found");
    const geometry = turf.geometry as { type?: string; coordinates?: unknown } | null;

    const contacts = await this.prisma.contact.findMany({
      where: {
        organizationId,
        lat: { not: null },
        lng: { not: null },
        OR: [{ turfId: null }, { turfId }],
      },
      select: { id: true, lat: true, lng: true, turfId: true },
    });

    const toAdd: string[] = [];
    const toRemove: string[] = [];
    for (const c of contacts) {
      const point: LngLat = [c.lng as number, c.lat as number];
      const inside = pointInGeometry(point, geometry);
      if (inside && c.turfId !== turfId) toAdd.push(c.id);
      else if (!inside && c.turfId === turfId) toRemove.push(c.id);
    }

    if (toAdd.length) {
      await this.prisma.contact.updateMany({ where: { id: { in: toAdd } }, data: { turfId } });
    }
    if (toRemove.length) {
      await this.prisma.contact.updateMany({ where: { id: { in: toRemove } }, data: { turfId: null } });
    }

    const total = await this.prisma.contact.count({ where: { organizationId, turfId } });
    return { added: toAdd.length, removed: toRemove.length, total };
  }

  // ── Shifts (G8) ─────────────────────────────────────────────────
  async listShifts(organizationId: string, campaignId?: string) {
    return this.prisma.shift.findMany({
      where: { organizationId, ...(campaignId ? { campaignId } : {}) },
      orderBy: { startsAt: "asc" },
    });
  }

  async createShift(
    organizationId: string,
    input: { campaignId: string; name: string; startsAt: string; endsAt: string; location?: string },
  ) {
    return this.prisma.shift.create({
      data: {
        organizationId,
        campaignId: input.campaignId,
        name: input.name,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        location: input.location ?? null,
      },
    });
  }

  async deleteShift(organizationId: string, id: string) {
    const res = await this.prisma.shift.deleteMany({ where: { id, organizationId } });
    if (res.count === 0) throw new ApiHttpException("SHIFT_NOT_FOUND", "Shift not found");
    return { deleted: true };
  }

  // ── QA review (G10): flag suspicious knocks ─────────────────────
  /** Knocks that look suspect: too-fast cadence or missing GPS. Read-only heuristic. */
  async qaReview(organizationId: string, campaignId: string) {
    const turfs = await this.prisma.turf.findMany({
      where: { organizationId, campaignId },
      select: { id: true },
    });
    const turfIds = turfs.map((t) => t.id);
    if (turfIds.length === 0) return { flags: [] };

    const knocks = await this.prisma.doorKnock.findMany({
      where: { organizationId, contact: { turfId: { in: turfIds } } },
      orderBy: [{ canvasserId: "asc" }, { createdAt: "asc" }],
      include: { canvasser: { select: { displayName: true } } },
    });

    const flags: Array<{ id: string; canvasser: string | null; reason: string; at: Date }> = [];
    let prev: { canvasserId: string | null; at: Date } | null = null;
    for (const k of knocks) {
      if (k.lat == null || k.lng == null) {
        flags.push({ id: k.id, canvasser: k.canvasser?.displayName ?? null, reason: "No GPS captured", at: k.createdAt });
      }
      if (prev && prev.canvasserId === k.canvasserId) {
        const gapSec = (k.createdAt.getTime() - prev.at.getTime()) / 1000;
        if (gapSec >= 0 && gapSec < 20) {
          flags.push({
            id: k.id,
            canvasser: k.canvasser?.displayName ?? null,
            reason: `Knocked ${Math.round(gapSec)}s after previous`,
            at: k.createdAt,
          });
        }
      }
      prev = { canvasserId: k.canvasserId, at: k.createdAt };
    }
    return { flags };
  }

  /** Walk lists for an org, optionally filtered to one turf, with item stats + lock. */
  async listWalkLists(organizationId: string, turfId?: string) {
    const walkLists = await this.prisma.walkList.findMany({
      where: { organizationId, ...(turfId ? { turfId } : {}) },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { items: true } },
        items: { where: { status: WalkListItemStatus.VISITED }, select: { id: true } },
        turf: {
          select: {
            id: true,
            name: true,
            assignments: {
              where: { status: TurfAssignmentStatus.ASSIGNED },
              include: { canvasser: { select: { id: true, displayName: true } } },
            },
          },
        },
      },
    });
    return walkLists.map((w) => {
      const lock = w.turf?.assignments[0];
      return {
        id: w.id,
        name: w.name,
        turfId: w.turfId,
        campaignId: w.campaignId,
        listType: w.listType,
        stopCount: w._count.items,
        visitedCount: w.items.length,
        assignedTo: lock
          ? {
              canvasserId: lock.canvasserId,
              name: lock.canvasser.displayName,
              lockedSince: lock.assignedAt,
              lockedUntil: lock.lockedUntil,
            }
          : null,
        createdAt: w.createdAt,
      };
    });
  }
}

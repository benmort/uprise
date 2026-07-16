import { HttpStatus, Injectable } from "@nestjs/common";
import {
  CannedVisibility,
  ContentObjectType,
  ContentSlot,
  ContentType,
  EngagementChannel,
} from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { ApiHttpException } from "../common/http/api-response";

type SetItemInput = { id: string; orderIndex?: number };

/** The disposition/canned channels an object of the given engagement channel should see. */
function channelsFor(channel: EngagementChannel): EngagementChannel[] {
  if (channel === EngagementChannel.BOTH)
    return [EngagementChannel.DOOR, EngagementChannel.SMS, EngagementChannel.BOTH];
  return [channel, EngagementChannel.BOTH];
}

/**
 * Content reuse: bind one survey/script/disposition-set/canned-set to MANY objects
 * (canvass campaigns + text blasts), resolve the flow an object should run, and
 * report reverse usage. The bindable library is tenant-scoped; bindings are
 * validated to belong to the tenant on both sides before insert.
 */
@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Bindings ───────────────────────────────────────────────────────────────

  /** Assert a content row of `type` exists for this tenant; returns nothing, throws if not. */
  private async assertContentExists(tenantId: string, type: ContentType, id: string): Promise<void> {
    const found = await this.findContent(tenantId, type, id);
    if (!found) throw new ApiHttpException("CONTENT_NOT_FOUND", "Content not found", HttpStatus.NOT_FOUND);
  }

  private async findContent(tenantId: string, type: ContentType, id: string): Promise<{ id: string } | null> {
    switch (type) {
      case ContentType.SURVEY:
        return this.prisma.survey.findFirst({ where: { id, tenantId }, select: { id: true } });
      case ContentType.SCRIPT:
        return this.prisma.script.findFirst({ where: { id, tenantId }, select: { id: true } });
      case ContentType.DISPOSITION_SET:
        return this.prisma.dispositionSet.findFirst({ where: { id, tenantId }, select: { id: true } });
      case ContentType.CANNED_SET:
        return this.prisma.cannedSet.findFirst({ where: { id, tenantId }, select: { id: true } });
      default:
        return null;
    }
  }

  private async assertObjectExists(
    tenantId: string,
    type: ContentObjectType,
    id: string,
  ): Promise<void> {
    const found =
      type === ContentObjectType.CANVASS_CAMPAIGN
        ? await this.prisma.canvassCampaign.findFirst({ where: { id, tenantId }, select: { id: true } })
        : await this.prisma.blast.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!found) throw new ApiHttpException("OBJECT_NOT_FOUND", "Target object not found", HttpStatus.NOT_FOUND);
  }

  /**
   * Bind content to an object in a slot. Replaces any existing content of the same
   * type in that slot (one primary survey per campaign, etc.). Validates both sides
   * belong to the tenant. For a PRIMARY canvass survey/script, mirrors to the legacy
   * `CanvassCampaign.surveyId/scriptId` + `Survey/Script.campaignId` fields so the
   * current door runtime keeps resolving content until it moves to the flow read.
   */
  async createBinding(
    tenantId: string,
    input: {
      contentType: ContentType;
      contentId: string;
      objectType: ContentObjectType;
      objectId: string;
      slot?: ContentSlot;
      orderIndex?: number;
    },
  ) {
    await this.assertContentExists(tenantId, input.contentType, input.contentId);
    await this.assertObjectExists(tenantId, input.objectType, input.objectId);
    const slot = input.slot ?? ContentSlot.PRIMARY;

    const binding = await this.prisma.$transaction(async (tx) => {
      await tx.contentBinding.deleteMany({
        where: {
          tenantId,
          objectType: input.objectType,
          objectId: input.objectId,
          contentType: input.contentType,
          slot,
        },
      });
      const created = await tx.contentBinding.create({
        data: {
          tenantId,
          contentType: input.contentType,
          contentId: input.contentId,
          objectType: input.objectType,
          objectId: input.objectId,
          slot,
          orderIndex: input.orderIndex ?? 0,
        },
      });
      await this.mirrorLegacy(tx, tenantId, input.contentType, input.contentId, input.objectType, input.objectId, slot);
      return created;
    });
    return binding;
  }

  async deleteBinding(tenantId: string, id: string) {
    const existing = await this.prisma.contentBinding.findFirst({ where: { id, tenantId } });
    if (!existing) throw new ApiHttpException("BINDING_NOT_FOUND", "Binding not found", HttpStatus.NOT_FOUND);
    await this.prisma.$transaction(async (tx) => {
      await tx.contentBinding.delete({ where: { id } });
      // Clear the legacy mirror when a PRIMARY canvass survey/script binding is removed.
      if (
        existing.slot === ContentSlot.PRIMARY &&
        existing.objectType === ContentObjectType.CANVASS_CAMPAIGN
      ) {
        if (existing.contentType === ContentType.SURVEY) {
          await tx.canvassCampaign.updateMany({ where: { id: existing.objectId, tenantId }, data: { surveyId: null } });
        } else if (existing.contentType === ContentType.SCRIPT) {
          await tx.canvassCampaign.updateMany({ where: { id: existing.objectId, tenantId }, data: { scriptId: null } });
        }
      }
    });
    return { deleted: true };
  }

  private async mirrorLegacy(
    tx: PrismaTx,
    tenantId: string,
    contentType: ContentType,
    contentId: string,
    objectType: ContentObjectType,
    objectId: string,
    slot: ContentSlot,
  ): Promise<void> {
    // Mirror only the per-campaign `CanvassCampaign.surveyId/scriptId` (one value per
    // campaign, so no clobber). We deliberately do NOT write the single-valued
    // `Survey.campaignId`/`Script.campaignId` reverse link — binding a survey to a
    // second campaign would silently break the first campaign's door survey. The door
    // runtime resolves via the binding-derived `campaignIds` list instead.
    if (slot !== ContentSlot.PRIMARY || objectType !== ContentObjectType.CANVASS_CAMPAIGN) return;
    if (contentType === ContentType.SURVEY) {
      await tx.canvassCampaign.updateMany({ where: { id: objectId, tenantId }, data: { surveyId: contentId } });
    } else if (contentType === ContentType.SCRIPT) {
      await tx.canvassCampaign.updateMany({ where: { id: objectId, tenantId }, data: { scriptId: contentId } });
    }
  }

  /** Bindings on an object, with a light content label for each. */
  async listBindings(tenantId: string, objectType: ContentObjectType, objectId: string) {
    const bindings = await this.prisma.contentBinding.findMany({
      where: { tenantId, objectType, objectId },
      orderBy: [{ contentType: "asc" }, { orderIndex: "asc" }],
    });
    return Promise.all(bindings.map(async (b) => ({ ...b, contentName: await this.contentName(tenantId, b.contentType, b.contentId) })));
  }

  private async contentName(tenantId: string, type: ContentType, id: string): Promise<string | null> {
    switch (type) {
      case ContentType.SURVEY:
        return (await this.prisma.survey.findFirst({ where: { id, tenantId }, select: { name: true } }))?.name ?? null;
      case ContentType.SCRIPT:
        return (await this.prisma.script.findFirst({ where: { id, tenantId }, select: { name: true } }))?.name ?? null;
      case ContentType.DISPOSITION_SET:
        return (await this.prisma.dispositionSet.findFirst({ where: { id, tenantId }, select: { name: true } }))?.name ?? null;
      case ContentType.CANNED_SET:
        return (await this.prisma.cannedSet.findFirst({ where: { id, tenantId }, select: { name: true } }))?.name ?? null;
      default:
        return null;
    }
  }

  /** Reverse view: which objects a piece of content is bound to ("used by N"). */
  async usage(tenantId: string, contentType: ContentType, contentId: string) {
    const bindings = await this.prisma.contentBinding.findMany({
      where: { tenantId, contentType, contentId },
      orderBy: { createdAt: "asc" },
    });
    const objects = await Promise.all(
      bindings.map(async (b) => ({
        bindingId: b.id,
        objectType: b.objectType,
        objectId: b.objectId,
        slot: b.slot,
        objectName: await this.objectName(tenantId, b.objectType, b.objectId),
      })),
    );
    return { count: objects.length, objects };
  }

  private async objectName(tenantId: string, type: ContentObjectType, id: string): Promise<string | null> {
    if (type === ContentObjectType.CANVASS_CAMPAIGN)
      return (await this.prisma.canvassCampaign.findFirst({ where: { id, tenantId }, select: { name: true } }))?.name ?? null;
    return (await this.prisma.blast.findFirst({ where: { id, tenantId }, select: { title: true } }))?.title ?? null;
  }

  /**
   * The full engagement flow an object should run: its bound survey + script, plus
   * the dispositions and canned responses (from bound sets, or the tenant defaults
   * when nothing is bound). Consumed by the door app and the SMS console.
   */
  async resolveFlow(tenantId: string, objectType: ContentObjectType, objectId: string) {
    const bindings = await this.prisma.contentBinding.findMany({ where: { tenantId, objectType, objectId } });
    const primary = (type: ContentType) =>
      bindings.find((b) => b.contentType === type && b.slot === ContentSlot.PRIMARY) ??
      bindings.find((b) => b.contentType === type);

    const surveyBinding = primary(ContentType.SURVEY);
    const scriptBinding = primary(ContentType.SCRIPT);
    const dispSetBinding = primary(ContentType.DISPOSITION_SET);
    const cannedSetBinding = primary(ContentType.CANNED_SET);

    // Derive the engagement channel from the OBJECT: a blast is SMS; a canvass
    // campaign carries its own DOOR/SMS/BOTH medium (defaulting to DOOR).
    let channel: EngagementChannel = EngagementChannel.DOOR;
    if (objectType === ContentObjectType.BLAST) {
      channel = EngagementChannel.SMS;
    } else {
      const campaign = await this.prisma.canvassCampaign.findFirst({ where: { id: objectId, tenantId }, select: { channel: true } });
      channel = campaign?.channel ?? EngagementChannel.DOOR;
    }

    const [survey, script, dispositions, canned] = await Promise.all([
      surveyBinding
        ? this.prisma.survey.findFirst({
            where: { id: surveyBinding.contentId, tenantId },
            include: { questions: { orderBy: { orderIndex: "asc" }, include: { options: { orderBy: { orderIndex: "asc" } } } } },
          })
        : null,
      scriptBinding
        ? this.prisma.script.findFirst({ where: { id: scriptBinding.contentId, tenantId }, include: { steps: { orderBy: { orderIndex: "asc" } } } })
        : null,
      this.resolveDispositions(tenantId, channel, dispSetBinding?.contentId ?? null),
      this.resolveCanned(tenantId, channel, cannedSetBinding?.contentId ?? null),
    ]);

    return { objectType, objectId, survey, script, dispositions, canned };
  }

  private async resolveDispositions(tenantId: string, channel: EngagementChannel, setId: string | null) {
    if (setId) {
      const items = await this.prisma.dispositionSetItem.findMany({
        where: { setId, set: { tenantId } },
        orderBy: { orderIndex: "asc" },
        include: { dispositionDef: true },
      });
      if (items.length) return items.map((i) => i.dispositionDef);
    }
    return this.prisma.dispositionDef.findMany({
      where: { OR: [{ tenantId: null }, { tenantId }], channel: { in: channelsFor(channel) } },
      orderBy: { orderIndex: "asc" },
    });
  }

  private async resolveCanned(tenantId: string, channel: EngagementChannel, setId: string | null) {
    if (setId) {
      const items = await this.prisma.cannedSetItem.findMany({
        where: { setId, set: { tenantId } },
        orderBy: { orderIndex: "asc" },
        include: { cannedResponse: true },
      });
      if (items.length) return items.map((i) => i.cannedResponse).filter((c) => !c.isArchived);
    }
    // Fallback excludes PERSONAL replies — the flow read has no caller-user context, so
    // returning another user's private canned replies would leak them within the tenant.
    return this.prisma.cannedResponse.findMany({
      where: {
        tenantId,
        isArchived: false,
        channel: { in: channelsFor(channel) },
        visibility: { in: [CannedVisibility.ORG, CannedVisibility.AUTO_SEND] },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  // ── Set membership validation (tenant isolation) ─────────────────────────────
  // Set items are bare id references (no cross-tenant FK guard), so every item id
  // MUST be checked against the caller's tenant before insert — otherwise a caller
  // could pull another tenant's disposition/canned rows into their set and read them
  // back via getSet / resolveFlow. Disposition defs also allow the null-tenant
  // system defaults.

  private async assertDispositionDefsOwned(tenantId: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    const found = await this.prisma.dispositionDef.findMany({
      where: { id: { in: ids }, OR: [{ tenantId }, { tenantId: null }] },
      select: { id: true },
    });
    const ok = new Set(found.map((f) => f.id));
    const bad = ids.filter((id) => !ok.has(id));
    if (bad.length)
      throw new ApiHttpException("DISPOSITION_NOT_FOUND", `Unknown disposition(s): ${bad.join(", ")}`, HttpStatus.BAD_REQUEST);
  }

  private async assertCannedOwned(tenantId: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    const found = await this.prisma.cannedResponse.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true },
    });
    const ok = new Set(found.map((f) => f.id));
    const bad = ids.filter((id) => !ok.has(id));
    if (bad.length)
      throw new ApiHttpException("CANNED_NOT_FOUND", `Unknown canned response(s): ${bad.join(", ")}`, HttpStatus.BAD_REQUEST);
  }

  // ── Disposition sets ─────────────────────────────────────────────────────────

  listDispositionSets(tenantId: string) {
    return this.prisma.dispositionSet.findMany({
      where: { tenantId, isArchived: false },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { items: true } } },
    });
  }

  async getDispositionSet(tenantId: string, id: string) {
    const set = await this.prisma.dispositionSet.findFirst({
      where: { id, tenantId },
      include: { items: { orderBy: { orderIndex: "asc" }, include: { dispositionDef: true } } },
    });
    if (!set) throw new ApiHttpException("SET_NOT_FOUND", "Disposition set not found", HttpStatus.NOT_FOUND);
    return set;
  }

  async createDispositionSet(tenantId: string, input: { name: string; items?: SetItemInput[] }) {
    await this.assertDispositionDefsOwned(tenantId, (input.items ?? []).map((it) => it.id));
    return this.prisma.dispositionSet.create({
      data: {
        tenantId,
        name: input.name,
        items: input.items ? { create: input.items.map((it, i) => ({ dispositionDefId: it.id, orderIndex: it.orderIndex ?? i })) } : undefined,
      },
      include: { items: { orderBy: { orderIndex: "asc" }, include: { dispositionDef: true } } },
    });
  }

  async updateDispositionSet(tenantId: string, id: string, input: { name?: string; isArchived?: boolean; items?: SetItemInput[] }) {
    const existing = await this.prisma.dispositionSet.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) throw new ApiHttpException("SET_NOT_FOUND", "Disposition set not found", HttpStatus.NOT_FOUND);
    if (input.items) await this.assertDispositionDefsOwned(tenantId, input.items.map((it) => it.id));
    return this.prisma.$transaction(async (tx) => {
      await tx.dispositionSet.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.isArchived !== undefined ? { isArchived: input.isArchived } : {}),
        },
      });
      if (input.items) {
        await tx.dispositionSetItem.deleteMany({ where: { setId: id } });
        for (const [i, it] of input.items.entries()) {
          await tx.dispositionSetItem.create({ data: { setId: id, dispositionDefId: it.id, orderIndex: it.orderIndex ?? i } });
        }
      }
      return tx.dispositionSet.findUnique({ where: { id }, include: { items: { orderBy: { orderIndex: "asc" }, include: { dispositionDef: true } } } });
    });
  }

  async deleteDispositionSet(tenantId: string, id: string) {
    const existing = await this.prisma.dispositionSet.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) throw new ApiHttpException("SET_NOT_FOUND", "Disposition set not found", HttpStatus.NOT_FOUND);
    await this.prisma.dispositionSet.update({ where: { id }, data: { isArchived: true } });
    return { archived: true };
  }

  // ── Canned sets ──────────────────────────────────────────────────────────────

  listCannedSets(tenantId: string) {
    return this.prisma.cannedSet.findMany({
      where: { tenantId, isArchived: false },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { items: true } } },
    });
  }

  async getCannedSet(tenantId: string, id: string) {
    const set = await this.prisma.cannedSet.findFirst({
      where: { id, tenantId },
      include: { items: { orderBy: { orderIndex: "asc" }, include: { cannedResponse: true } } },
    });
    if (!set) throw new ApiHttpException("SET_NOT_FOUND", "Canned set not found", HttpStatus.NOT_FOUND);
    return set;
  }

  async createCannedSet(tenantId: string, input: { name: string; items?: SetItemInput[] }) {
    await this.assertCannedOwned(tenantId, (input.items ?? []).map((it) => it.id));
    return this.prisma.cannedSet.create({
      data: {
        tenantId,
        name: input.name,
        items: input.items ? { create: input.items.map((it, i) => ({ cannedResponseId: it.id, orderIndex: it.orderIndex ?? i })) } : undefined,
      },
      include: { items: { orderBy: { orderIndex: "asc" }, include: { cannedResponse: true } } },
    });
  }

  async updateCannedSet(tenantId: string, id: string, input: { name?: string; isArchived?: boolean; items?: SetItemInput[] }) {
    const existing = await this.prisma.cannedSet.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) throw new ApiHttpException("SET_NOT_FOUND", "Canned set not found", HttpStatus.NOT_FOUND);
    if (input.items) await this.assertCannedOwned(tenantId, input.items.map((it) => it.id));
    return this.prisma.$transaction(async (tx) => {
      await tx.cannedSet.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.isArchived !== undefined ? { isArchived: input.isArchived } : {}),
        },
      });
      if (input.items) {
        await tx.cannedSetItem.deleteMany({ where: { setId: id } });
        for (const [i, it] of input.items.entries()) {
          await tx.cannedSetItem.create({ data: { setId: id, cannedResponseId: it.id, orderIndex: it.orderIndex ?? i } });
        }
      }
      return tx.cannedSet.findUnique({ where: { id }, include: { items: { orderBy: { orderIndex: "asc" }, include: { cannedResponse: true } } } });
    });
  }

  async deleteCannedSet(tenantId: string, id: string) {
    const existing = await this.prisma.cannedSet.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) throw new ApiHttpException("SET_NOT_FOUND", "Canned set not found", HttpStatus.NOT_FOUND);
    await this.prisma.cannedSet.update({ where: { id }, data: { isArchived: true } });
    return { archived: true };
  }
}

// Prisma interactive-transaction client type (the callback param of $transaction).
type PrismaTx = Parameters<Parameters<PrismaService["$transaction"]>[0]>[0];

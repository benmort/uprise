import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { ApiHttpException } from "../common/http/api-response";
import type { ContactTagPort } from "./tag.port";

/** "Volunteer supporter" → "volunteer_supporter". */
export function slugifyTag(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64) || "tag";
}

const humanize = (key: string) => key.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

@Injectable()
export class TagsService implements ContactTagPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  listTags(tenantId: string) {
    return this.prisma.contactTag.findMany({
      where: { tenantId },
      orderBy: { label: "asc" },
      include: { _count: { select: { assignments: true } } },
    });
  }

  async createTag(tenantId: string, input: { label: string; key?: string; color?: string | null }) {
    const key = input.key ? slugifyTag(input.key) : slugifyTag(input.label);
    const existing = await this.prisma.contactTag.findUnique({ where: { tenantId_key: { tenantId, key } } });
    if (existing) return existing;
    return this.prisma.contactTag.create({
      data: { tenantId, key, label: input.label, color: input.color ?? null },
    });
  }

  async deleteTag(tenantId: string, id: string) {
    const tag = await this.prisma.contactTag.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!tag) throw new ApiHttpException("TAG_NOT_FOUND", "Tag not found", HttpStatus.NOT_FOUND);
    await this.prisma.contactTag.delete({ where: { id } });
    return { deleted: true };
  }

  getContactTags(tenantId: string, contactId: string) {
    return this.prisma.contactTagAssignment.findMany({
      where: { tenantId, contactId },
      orderBy: { createdAt: "desc" },
      include: { tag: true },
    });
  }

  /** Assign an existing tag (by id) to a contact — the manual UI path. */
  async assignTag(tenantId: string, contactId: string, tagId: string, source = "manual") {
    const tag = await this.prisma.contactTag.findFirst({ where: { id: tagId, tenantId } });
    if (!tag) throw new ApiHttpException("TAG_NOT_FOUND", "Tag not found", HttpStatus.NOT_FOUND);
    await this.applyTag(tenantId, contactId, tag.key, source);
    return { ok: true };
  }

  async removeTag(tenantId: string, contactId: string, tagId: string) {
    await this.prisma.contactTagAssignment.deleteMany({ where: { tenantId, contactId, tagId } });
    return { removed: true };
  }

  /**
   * Port entry: ensure the tag exists (by key), assign it idempotently, and emit
   * contacts.tag.added atomically when a NEW assignment is created. Re-applying an
   * existing tag is a silent no-op (no duplicate event).
   */
  async applyTag(tenantId: string, contactId: string, key: string, source = "manual"): Promise<void> {
    // Ignore a blank tag (a misconfigured journey rung) rather than minting a literal "tag".
    if (!key || !key.trim()) return;
    // The contactId is caller-supplied (URL / journey payload) — verify it's THIS tenant's
    // before writing an assignment, or a caller could tag another tenant's contact.
    const contact = await this.prisma.contact.findFirst({ where: { id: contactId, tenantId }, select: { id: true } });
    if (!contact) throw new ApiHttpException("CONTACT_NOT_FOUND", "Contact not found", HttpStatus.NOT_FOUND);
    const slug = slugifyTag(key);
    await this.prisma.$transaction(async (tx) => {
      const tag = await tx.contactTag.upsert({
        where: { tenantId_key: { tenantId, key: slug } },
        update: {},
        create: { tenantId, key: slug, label: humanize(slug) },
      });
      const existing = await tx.contactTagAssignment.findFirst({
        where: { tenantId, contactId, tagId: tag.id },
        select: { id: true },
      });
      if (existing) return;
      await tx.contactTagAssignment.create({ data: { tenantId, contactId, tagId: tag.id, source } });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "contacts.tag.added",
        aggregateId: contactId,
        payload: { tenantId, contactId, tagId: tag.id, key: slug, source },
      });
    });
  }
}

import { Injectable } from "@nestjs/common";
import {
  collectEffectiveLeaves,
  composeEffectiveTree,
  foldEffectiveTree,
  orderByHash,
  type ComplianceChannel,
  type EffectiveGroupNode,
  type MaskedRecipient,
  type SegmentCustomClause,
  type SegmentPolicy,
  type SegmentPreview,
  type FilterNode,
} from "@uprise/segmentation";
import { PrismaService } from "../prisma/prisma.service";
import { SegmentLeafResolverService } from "./segment-leaf-resolver.service";

export interface PreviewInput {
  filter: FilterNode;
  policy: SegmentPolicy;
  customClauses?: SegmentCustomClause[];
  /** The blast channel the L3 floor previews against. Default SMS. */
  channel?: ComplianceChannel;
  /** Deterministic-order seed — pass the saved segment's seed so sample == send head. */
  seed?: string;
}

const SAMPLE_SIZE = 20;

/** `+61412345789` → `+61•••••789` (never the full number). */
export const maskPhone = (phone: string | null): string | null => {
  if (!phone) return null;
  if (phone.length <= 6) return "•".repeat(phone.length);
  return `${phone.slice(0, 3)}${"•".repeat(phone.length - 6)}${phone.slice(-3)}`;
};

/** `alex@example.org` → `a•••@example.org` (never the full address). */
export const maskEmail = (email: string | null): string | null => {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at <= 0) return "•••";
  return `${email[0]}•••${email.slice(at)}`;
};

/**
 * Live segment preview — the builder's counts + masked sample. A LIVE read that
 * materialises nothing: compose the full effective tree, resolve every leaf
 * ONCE, then fold each layer prefix (L1 / L1∩L2 / L1∩L2∩L3) over the shared
 * resolution so the three counts are mutually consistent by construction.
 *
 * The sample is the head of the deterministic hash order over the SENDABLE set
 * — with the saved segment's seed, it is exactly the eventual send order's head
 * (preview == send).
 */
@Injectable()
export class SegmentPreviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leafResolver: SegmentLeafResolverService,
  ) {}

  async preview(tenantId: string, input: PreviewInput): Promise<SegmentPreview> {
    const composed = composeEffectiveTree(
      { filter: input.filter, policy: input.policy },
      "blast",
      { channel: input.channel ?? "SMS" },
    );

    const universe = await this.leafResolver.universe(tenantId);
    const { resolved, clauseErrors } = await this.leafResolver.resolveLeaves(
      tenantId,
      collectEffectiveLeaves(composed.tree),
      universe,
      { customClauses: input.customClauses },
    );
    // Layer-prefix folds over the SAME resolved leaves (object identity holds —
    // the prefix groups reuse the composed tree's child nodes).
    const children = composed.tree.children;
    const prefix = (count: number): EffectiveGroupNode => ({
      kind: "all",
      layer: "composition",
      editable: false,
      children: children.slice(0, count),
    });

    const foldPrefix = (count: number): Set<string> =>
      foldEffectiveTree(prefix(count), (leaf) => resolved.get(leaf) ?? new Set(), universe);

    // children order: [intent, policy?, compliance?] per composeEffectiveTree.
    const policyIndex = composed.applied.policy ? 2 : 1;
    const matchedSet = foldPrefix(1);
    const shapedSet = composed.applied.policy ? foldPrefix(policyIndex) : matchedSet;
    const sendableSet = composed.applied.compliance ? foldPrefix(children.length) : shapedSet;

    const seed = input.seed && /^\S+$/.test(input.seed) ? input.seed : "preview";
    const sampleIds = orderByHash(sendableSet, seed).slice(0, SAMPLE_SIZE);
    const sample = await this.maskedSample(tenantId, sampleIds);

    return {
      total: universe.size,
      matched: matchedSet.size,
      shaped: shapedSet.size,
      sendable: sendableSet.size,
      excludedByPolicy: matchedSet.size - shapedSet.size,
      excludedByCompliance: shapedSet.size - sendableSet.size,
      sample,
      ...(clauseErrors.length ? { clauseErrors } : {}),
    };
  }

  /** Fetch + mask the sample contacts, preserving the hash order. */
  private async maskedSample(tenantId: string, ids: string[]): Promise<MaskedRecipient[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.contact.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, phoneE164: true, email: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => ({
        contactId: r.id,
        maskedPhone: maskPhone(r.phoneE164),
        maskedEmail: maskEmail(r.email),
        name: [r.firstName, r.lastName].filter(Boolean).join(" ") || null,
      }));
  }
}

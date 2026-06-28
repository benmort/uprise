import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@uprise/db";
import { isFeatureFlagKey } from "@uprise/flags";
import { PrismaService } from "../../prisma/prisma.service";

/** Keep only valid catalogue flag keys with boolean values. */
function sanitiseFeatureFlags(input: Record<string, unknown>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(input)) {
    if (isFeatureFlagKey(k) && typeof v === "boolean") out[k] = v;
  }
  return out;
}

/** Editable plan fields (pricing/marketing/limits + entitlements + visibility). */
export interface PlanWritable {
  displayName?: string;
  featureFlags?: Record<string, unknown>;
  isDefault?: boolean;
  archived?: boolean;
  publiclyVisible?: boolean;
  order?: number;
  popular?: boolean;
  description?: string | null;
  priceMonthly?: number | null;
  priceMonthlyOriginal?: number | null;
  priceAnnually?: number | null;
  priceAnnuallyOriginal?: number | null;
  limits?: unknown; // { contacts, teamMembers, segments } (null member = unlimited)
  features?: unknown; // [{ label, value: boolean|string }]
}

const json = (v: unknown): Prisma.InputJsonValue | undefined =>
  v === undefined ? undefined : (v as Prisma.InputJsonValue);

/** Map the writable fields to a Prisma update payload (undefined = leave unchanged). */
function toUpdateData(input: PlanWritable): Prisma.PlanUpdateInput {
  return {
    displayName: input.displayName ?? undefined,
    featureFlags: input.featureFlags
      ? (sanitiseFeatureFlags(input.featureFlags) as Prisma.InputJsonValue)
      : undefined,
    isDefault: input.isDefault ?? undefined,
    archivedAt: input.archived === undefined ? undefined : input.archived ? new Date() : null,
    publiclyVisible: input.publiclyVisible ?? undefined,
    order: input.order ?? undefined,
    popular: input.popular ?? undefined,
    description: input.description === undefined ? undefined : input.description,
    priceMonthly: input.priceMonthly === undefined ? undefined : input.priceMonthly,
    priceMonthlyOriginal:
      input.priceMonthlyOriginal === undefined ? undefined : input.priceMonthlyOriginal,
    priceAnnually: input.priceAnnually === undefined ? undefined : input.priceAnnually,
    priceAnnuallyOriginal:
      input.priceAnnuallyOriginal === undefined ? undefined : input.priceAnnuallyOriginal,
    limits: json(input.limits),
    features: json(input.features),
  };
}

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  /** All plans (admin / super-admin), by tier order. */
  list() {
    return this.prisma.plan.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
  }

  /** Publicly-visible, non-archived plans for the marketing pricing page (no auth). */
  listPublic() {
    return this.prisma.plan.findMany({
      where: { publiclyVisible: true, archivedAt: null },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
  }

  /** Create or update a plan by key (its `key` matches Network.planName). */
  upsert(input: { key: string; displayName: string; featureFlags: Record<string, unknown> } & PlanWritable) {
    const featureFlags = sanitiseFeatureFlags(input.featureFlags) as Prisma.InputJsonValue;
    return this.prisma.plan.upsert({
      where: { key: input.key },
      create: {
        key: input.key,
        displayName: input.displayName,
        featureFlags,
        isDefault: input.isDefault ?? false,
        publiclyVisible: input.publiclyVisible ?? true,
        order: input.order ?? 0,
        popular: input.popular ?? false,
        description: input.description ?? null,
        priceMonthly: input.priceMonthly ?? null,
        priceMonthlyOriginal: input.priceMonthlyOriginal ?? null,
        priceAnnually: input.priceAnnually ?? null,
        priceAnnuallyOriginal: input.priceAnnuallyOriginal ?? null,
        limits: json(input.limits),
        features: json(input.features),
      },
      update: { ...toUpdateData(input), archivedAt: null },
    });
  }

  async update(id: string, input: PlanWritable) {
    const existing = await this.prisma.plan.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Plan not found");
    return this.prisma.plan.update({ where: { id }, data: toUpdateData(input) });
  }
}

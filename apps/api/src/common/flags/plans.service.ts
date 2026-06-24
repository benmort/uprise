import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@yarns/db";
import { isFeatureFlagKey } from "@yarns/flags";
import { PrismaService } from "../../prisma/prisma.service";

/** Keep only valid catalogue flag keys with boolean values. */
function sanitiseFeatureFlags(input: Record<string, unknown>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(input)) {
    if (isFeatureFlagKey(k) && typeof v === "boolean") out[k] = v;
  }
  return out;
}

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.plan.findMany({ orderBy: { createdAt: "asc" } });
  }

  /** Create or update a plan by key (its `key` matches Network.planName). */
  upsert(input: { key: string; displayName: string; featureFlags: Record<string, unknown>; isDefault?: boolean }) {
    const featureFlags = sanitiseFeatureFlags(input.featureFlags) as Prisma.InputJsonValue;
    return this.prisma.plan.upsert({
      where: { key: input.key },
      create: { key: input.key, displayName: input.displayName, featureFlags, isDefault: input.isDefault ?? false },
      update: { displayName: input.displayName, featureFlags, isDefault: input.isDefault ?? false, archivedAt: null },
    });
  }

  async update(
    id: string,
    input: { displayName?: string; featureFlags?: Record<string, unknown>; isDefault?: boolean; archived?: boolean },
  ) {
    const existing = await this.prisma.plan.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Plan not found");
    return this.prisma.plan.update({
      where: { id },
      data: {
        displayName: input.displayName ?? undefined,
        featureFlags: input.featureFlags
          ? (sanitiseFeatureFlags(input.featureFlags) as Prisma.InputJsonValue)
          : undefined,
        isDefault: input.isDefault ?? undefined,
        archivedAt: input.archived === undefined ? undefined : input.archived ? new Date() : null,
      },
    });
  }
}

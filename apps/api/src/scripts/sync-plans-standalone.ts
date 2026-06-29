import { PrismaClient, Prisma } from "@uprise/db";
import { PLAN_SEED } from "../shared-seed/plans.seed";

/**
 * One-off: upsert the canonical plan data (pricing, limits, feature rows, entitlement
 * flags) onto existing plans. Unlike the non-clobbering seeder, this OVERWRITES those
 * fields — used to fill in plans that were created by an older seed before the pricing
 * columns existed (null prices/limits/features). Nest-free so it runs in the build.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    for (const p of PLAN_SEED) {
      const data = {
        displayName: p.displayName,
        publiclyVisible: p.publiclyVisible,
        isDefault: p.isDefault,
        order: p.order,
        popular: p.popular,
        description: p.description,
        priceMonthly: p.priceMonthly,
        priceMonthlyOriginal: p.priceMonthlyOriginal,
        priceAnnually: p.priceAnnually,
        priceAnnuallyOriginal: p.priceAnnuallyOriginal,
        featureFlags: p.featureFlags as Prisma.InputJsonValue,
        limits: p.limits as Prisma.InputJsonValue,
        features: p.features as Prisma.InputJsonValue,
      };
      await prisma.plan.upsert({
        where: { key: p.key },
        create: { key: p.key, ...data },
        update: data,
      });
    }
    // eslint-disable-next-line no-console
    console.log("Plans synced:", PLAN_SEED.map((p) => p.key).join(", "));
  } finally {
    await prisma.$disconnect();
  }
}

void main();

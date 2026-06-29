import { PrismaClient } from "@uprise/db";
import type { PrismaService } from "../prisma/prisma.service";
import { seedPlans } from "../shared-seed/plans.seed";

/**
 * Nest-free plan seeder for the deploy build. `seed-plans.ts` boots the whole
 * AppModule (Redis, queues, …) which is too heavy/fragile for a build step; this
 * talks to Postgres with a bare PrismaClient and reuses the same non-clobbering
 * `seedPlans` logic. Safe to run repeatedly — it only creates missing plans.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const created = await seedPlans(prisma as unknown as PrismaService);
    // eslint-disable-next-line no-console
    console.log(
      created.length ? `Plans created: ${created.join(", ")}` : "All plans already exist.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
